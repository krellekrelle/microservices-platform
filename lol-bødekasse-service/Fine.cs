using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace bodekasseAPI.Models
{
    public class Fine
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        public int FineSize { get; set; }
        public DateTime Date { get; set; }

        [ForeignKey("Match")]
        public string MatchId { get; set; }
        public Match Match { get; set; }
        public FineType FineType { get; set; }

        [Required]
        public string UserId { get; set; }

        [ForeignKey("UserId")]
        public virtual IdentityUser User { get; set; }
    }

    public enum FineType
    {
        WonAram,
        LostAram,
        YasouFine
    }
}