using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace bodekasseAPI.Models
{
    public class RiotAccount
    {
        [Key]
        [Required]
        [MaxLength(78)] // Ensuring the length matches the PUUID specification
        public string Puuid { get; set; }

        [Required]
        [MaxLength(100)]
        public string SummonerName { get; set; }

        [Required]
        [MaxLength(3)] // Limiting SummonerRegion to 3 characters
        public string SummonerTag { get; set; }

        // Foreign key for AspNetUser
        [Required]
        public string UserId { get; set; }

        [ForeignKey("UserId")]
        public virtual IdentityUser User { get; set; }
    }
}