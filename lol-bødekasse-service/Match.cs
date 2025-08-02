using System.ComponentModel.DataAnnotations;

namespace bodekasseAPI.Models
{
    public class Match
    {
        [Key]
        public string MatchId { get; set; }
        public string DataVersion { get; set; }
        public string EndOfGameResult { get; set; }
        public long GameCreation { get; set; }
        public int GameDuration { get; set; }
        public long GameEndTimestamp { get; set; }
        public long GameStartTimestamp { get; set; }
        public long GameId { get; set; }
        public string GameMode { get; set; }
        public string GameName { get; set; }
        public string GameType { get; set; }
        public string GameVersion { get; set; }
        public int MapId { get; set; }
        public int QueueId { get; set; }
        public string PlatformId { get; set; }

        public ICollection<Team> Teams { get; set; }
        public ICollection<Participant> Participants { get; set; }
        public ICollection<Fine> Fines { get; set; } // Add this line

    }

    public class Team
    {
        [Key]
        public int TeamId { get; set; }
        public bool Win { get; set; }

        public string MatchId { get; set; }
        public Match Match { get; set; }

        public ICollection<Ban> Bans { get; set; }
    }

    public class Ban
    {
        [Key]
        public int BanId { get; set; }
        public int ChampionId { get; set; }
        public int PickTurn { get; set; }

        public int TeamId { get; set; }
        public Team Team { get; set; }
    }

    public class Participant
    {
        [Key]
        public int ParticipantPrimaryKey { get; set; } // New primary key
        public int ParticipantId { get; set; }
        public string Puuid { get; set; }
        public string RiotIdTagline { get; set; }
        public int ProfileIcon { get; set; }
        public int SummonerLevel { get; set; }
        public string SummonerName { get; set; }

        public bool Win { get; set; }
        public bool GameEndedInSurrender { get; set; }

        public string ChampionName { get; set; }
        public int Kills { get; set; }
        public int Deaths { get; set; }
        public int Assists { get; set; }
        public double Kda { get; set; }
        public double KillParticipation { get; set; }

        public int LargestKillingSpree { get; set; }
        public int LargestMultiKill { get; set; }
        public int SoloKills { get; set; }
        public int DoubleKills { get; set; }
        public int TripleKills { get; set; }
        public int QuadraKills { get; set; }
        public int PentaKills { get; set; }

        public int Item0 { get; set; }
        public int Item1 { get; set; }
        public int Item2 { get; set; }
        public int Item3 { get; set; }
        public int Item4 { get; set; }
        public int Item5 { get; set; }
        public int Item6 { get; set; }

        public string Lane { get; set; }
        public string Role { get; set; }
        public string TeamPosition { get; set; }
        public string IndividualPosition { get; set; }

        public int TimePlayed { get; set; }
        public int GoldEarned { get; set; }
        public int LongestTimeSpentLiving { get; set; }
        public int NeutralMinionsKilled { get; set; }
        public int TimeCCingOthers { get; set; }
        public int TotalDamageDealtToChampions { get; set; }
        public int TotalDamageShieldedOnTeammates { get; set; }
        public int TotalDamageTaken { get; set; }
        public int TotalHeal { get; set; }
        public int TotalHealsOnTeammates { get; set; }
        public int TotalMinionsKilled { get; set; }
        public int TotalTimeCCDealt { get; set; }
        public int TotalTimeSpentDead { get; set; }
        public int TurretKills { get; set; }
        public int TurretTakedowns { get; set; }
        public int TurretsLost { get; set; }
        public int VisionScore { get; set; }
        public int WardsPlaced { get; set; }

        public string MatchId { get; set; }
        public Match Match { get; set; }
    }

}