using bodekasseAPI.Controllers.Data;
using bodekasseAPI.Models;
using bodekasseAPI.Models.jsonDTO;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Text.Json;

namespace bodekasseAPI.Jobs
{
    public class loadGamesJob
    {
        private readonly IServiceScopeFactory _serviceScopeFactory;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        public loadGamesJob(IServiceScopeFactory serviceScopeFactory, IHttpClientFactory httpClientFactory, IConfiguration configuration)
        {
            _serviceScopeFactory = serviceScopeFactory;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
        }

        private void DetachAllEntities(DataContext context)
        {
            foreach (var entry in context.ChangeTracker.Entries().ToList())
            {
                if (entry.State == EntityState.Added || entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    entry.State = EntityState.Detached;
                }
            }
        }

        public async Task ExecuteAsync()
        {
            Console.WriteLine("Executing the loadGamesJob.");
            using (var scope = _serviceScopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<DataContext>();

                // Retrieve all rows from the table
                var entities = await context.RiotAccounts.ToListAsync();

                // Process the data
                foreach (var entity in entities)
                {
                    Console.WriteLine($"Id: {entity.Puuid}, Name: {entity.SummonerName}");
                    await getAccountMatches(entity.Puuid, context);
                }
            }
        }

        public (long nowEpoch, long oneWeekAgoEpoch) GetEpochTimestamps()
        {
            // Get the current UTC datetime
            DateTime now = DateTime.UtcNow;

            // Calculate the datetime for one day ago
            DateTime oneWeekAgo = now.AddDays(-1);

            // Get epoch for the first of june 2024
            //DateTime dateTime = new DateTime(2024, 6, 1, 0, 0, 0, DateTimeKind.Utc);

            // Convert both datetimes to epoch timestamps
            long nowEpoch = new DateTimeOffset(now).ToUnixTimeSeconds();
            long oneWeekAgoEpoch = new DateTimeOffset(oneWeekAgo).ToUnixTimeSeconds();
            //long dateTimeEpoch = new DateTimeOffset(dateTime).ToUnixTimeSeconds();

            return (nowEpoch, oneWeekAgoEpoch);
        }

        // TODO update to run every hour and look two hours back
        public async Task getAccountMatches(string puuid, DataContext context)
        {
            // Get the current and one week ago epoch timestamps
            var (endEpoch, startEpoch) = GetEpochTimestamps();

            var region = "europe";
            var count = 100;

            var apiKey = _configuration["RiotApiKey"];
            var requestUrl = $"https://{region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?startTime={startEpoch}&endTime={endEpoch}&start=0&count={count}&api_key={apiKey}";

            
            var client = _httpClientFactory.CreateClient();

            var response = await client.GetAsync(requestUrl);

            // check response
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Error: {response.StatusCode}");
                return;
            }

            // Get the response content
            var responseContent = await response.Content.ReadAsStringAsync();
            // format of response is 
            // ["EUW1_1234567890", "EUW1_1234567891", "EUW1_1234567892"]
            var matchIds = JsonSerializer.Deserialize<List<string>>(responseContent);

            // check matchIds
            if (matchIds == null || matchIds.Count == 0)
            {
                Console.WriteLine("No matches found.");
                return;
            }
            var cnt = 0;
            // Loop through the match ids
            foreach (var matchId in matchIds)
            {
                cnt++;
                // Check if matchId is already in the Matches table
                var match = await context.Matches.FindAsync(matchId);

                if (match != null)
                {
                    Console.WriteLine($"Match {matchId} already exists in the database.");
                    continue;
                }

                // Get match details
                var matchRequestUrl = $"https://{region}.api.riotgames.com/lol/match/v5/matches/{matchId}?api_key={apiKey}";
                var matchResponse = await client.GetAsync(matchRequestUrl);
                // check response
                if (!matchResponse.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Error: {matchResponse.StatusCode}");
                    return;
                }

                // Get the response content
                RiotMatchJson? matchJson = null;
                var matchResponseContent = await matchResponse.Content.ReadAsStringAsync();
                try
                {                     
                    matchJson = JsonSerializer.Deserialize<RiotMatchJson>(matchResponseContent);
                } catch (Exception e) {
                    Console.WriteLine($"Error: {matchJson}");
                    Console.WriteLine($"Error: {e.Message}");
                    return;
                }
                //var matchResponseContent = await matchResponse.Content.ReadAsStringAsync();
                //var matchJson = JsonSerializer.Deserialize<RiotMatchJson>(matchResponseContent);

                // Check if the match is valid
                if (matchJson == null)
                {
                    Console.WriteLine($"Match {matchId} is invalid.");
                    continue;
                }


                // Process and create entities
                var matchDTO = new Match
                {
                    MatchId = matchJson.metadata.matchId,
                    DataVersion = matchJson.metadata.dataVersion,
                    EndOfGameResult = matchJson.info.endOfGameResult,
                    GameCreation = matchJson.info.gameCreation,
                    GameDuration = matchJson.info.gameDuration,
                    GameEndTimestamp = matchJson.info.gameEndTimestamp,
                    GameStartTimestamp = matchJson.info.gameStartTimestamp,
                    GameId = matchJson.info.gameId,
                    GameMode = matchJson.info.gameMode,
                    GameName = matchJson.info.gameName,
                    GameType = matchJson.info.gameType,
                    GameVersion = matchJson.info.gameVersion,
                    MapId = matchJson.info.mapId,
                    QueueId = matchJson.info.queueId,
                    PlatformId = matchJson.info.platformId,
                    Teams = matchJson.info.teams.Select(t => new Models.Team
                    {
                        Win = t.win,
                        Bans = t.bans.Select(b => new Models.Ban
                        {
                            ChampionId = b.championId,
                            PickTurn = b.pickTurn
                        }).ToList()
                    }).ToList(),
                    Participants = new List<Models.Participant>()
                };

                // Process participants
                foreach (var p in matchJson.info.participants)
                {
                    var participantDTO = new Models.Participant
                    {
                        ParticipantId = p.participantId,
                        Puuid = p.puuid,
                        RiotIdTagline = p.riotIdTagline,
                        ProfileIcon = p.profileIcon,
                        SummonerLevel = p.summonerLevel,
                        SummonerName = p.summonerName,
                        Win = p.win,
                        GameEndedInSurrender = p.gameEndedInSurrender,
                        ChampionName = p.championName,
                        Kills = p.kills,
                        Deaths = p.deaths,
                        Assists = p.assists,
                        Kda = p.challenges.kda,
                        KillParticipation = p.challenges.kda,
                        LargestKillingSpree = p.largestKillingSpree,
                        LargestMultiKill = p.largestMultiKill,
                        SoloKills = p.challenges.soloKills,
                        DoubleKills = p.doubleKills,
                        TripleKills = p.tripleKills,
                        QuadraKills = p.quadraKills,
                        PentaKills = p.pentaKills,
                        Item0 = p.item0,
                        Item1 = p.item1,
                        Item2 = p.item2,
                        Item3 = p.item3,
                        Item4 = p.item4,
                        Item5 = p.item5,
                        Item6 = p.item6,
                        Lane = p.lane,
                        Role = p.role,
                        TeamPosition = p.teamPosition,
                        IndividualPosition = p.individualPosition,
                        TimePlayed = p.timePlayed,
                        GoldEarned = p.goldEarned,
                        LongestTimeSpentLiving = p.longestTimeSpentLiving,
                        NeutralMinionsKilled = p.neutralMinionsKilled,
                        TimeCCingOthers = p.timeCCingOthers,
                        TotalDamageDealtToChampions = p.totalDamageDealtToChampions,
                        TotalDamageShieldedOnTeammates = p.totalDamageShieldedOnTeammates,
                        TotalDamageTaken = p.totalDamageTaken,
                        TotalHeal = p.totalHeal,
                        TotalHealsOnTeammates = p.totalHealsOnTeammates,
                        TotalMinionsKilled = p.totalMinionsKilled,
                        TotalTimeCCDealt = p.totalTimeCCDealt,
                        TotalTimeSpentDead = p.totalTimeSpentDead,
                        TurretKills = p.turretKills,
                        TurretTakedowns = p.turretTakedowns,
                        TurretsLost = p.turretsLost,
                        VisionScore = p.visionScore,
                        WardsPlaced = p.wardsPlaced,
                    };

                    // Add the participant to the list
                    matchDTO.Participants.Add(participantDTO);
                }

                // Detach entities before adding to avoid conflicts
                DetachAllEntities(context);
                // Add the match to the database
                context.Matches.Add(matchDTO);
                await context.SaveChangesAsync(); // Ensure changes are saved to the database
            }
        }

    }

}