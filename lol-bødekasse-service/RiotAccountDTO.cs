using System.Text.Json.Serialization;

namespace bodekasseAPI.Models.DTO
{
    public class AddRiotAccountDto
    {
        public string SummonerName { get; set; }
        public string SummonerTag { get; set; }
    }
    public class RemoveRiotAccountDto
    {
        public string Puuid { get; set; }
    }
    public class RiotApiResponseDto
    {
        [JsonPropertyName("puuid")]
        public string Puuid { get; set; }

        [JsonPropertyName("gameName")]
        public string GameName { get; set; }

        [JsonPropertyName("tagLine")]
        public string TagLine { get; set; }
    }

}