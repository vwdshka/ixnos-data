using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSupersededAndApiKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "superseded_by",
                table: "procurement_item",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "api_key",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    prefix = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    key_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    permits_per_minute = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_api_key", x => x.id);
                    table.ForeignKey(
                        name: "fk_api_key_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_account",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_api_key_key_hash",
                table: "api_key",
                column: "key_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_api_key_user_id",
                table: "api_key",
                column: "user_id");

            // Διαύγεια corrections name the decision they replace by its version UUID (raw
            // versionId); the pipeline matches them after each run, so look-ups need an index.
            migrationBuilder.Sql(
                "CREATE INDEX ix_procurement_item_diavgeia_version ON procurement_item ((raw->>'versionId')) WHERE source = 'diavgeia';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "api_key");

            migrationBuilder.DropColumn(
                name: "superseded_by",
                table: "procurement_item");
            migrationBuilder.Sql("DROP INDEX ix_procurement_item_diavgeia_version;");
        }
    }
}
