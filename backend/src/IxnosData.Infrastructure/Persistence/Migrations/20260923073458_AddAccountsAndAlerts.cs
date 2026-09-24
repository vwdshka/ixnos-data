using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountsAndAlerts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "login_token",
                columns: table => new
                {
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    locale = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_login_token", x => x.token_hash);
                });

            migrationBuilder.CreateTable(
                name: "user_account",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    locale = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_account", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "saved_search",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    query = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    cpv = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    nuts = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    min_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    max_amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    checked_up_to = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_saved_search", x => x.id);
                    table.ForeignKey(
                        name: "fk_saved_search_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_account",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_session",
                columns: table => new
                {
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_session", x => x.token_hash);
                    table.ForeignKey(
                        name: "fk_user_session_user_account_user_id",
                        column: x => x.user_id,
                        principalTable: "user_account",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "alert_delivery",
                columns: table => new
                {
                    saved_search_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_source_id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_alert_delivery", x => new { x.saved_search_id, x.item_source_id });
                    table.ForeignKey(
                        name: "fk_alert_delivery_saved_searches_saved_search_id",
                        column: x => x.saved_search_id,
                        principalTable: "saved_search",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_login_token_email_created_at",
                table: "login_token",
                columns: new[] { "email", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_saved_search_user_id",
                table: "saved_search",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_account_email",
                table: "user_account",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_session_user_id",
                table: "user_session",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "alert_delivery");

            migrationBuilder.DropTable(
                name: "login_token");

            migrationBuilder.DropTable(
                name: "user_session");

            migrationBuilder.DropTable(
                name: "saved_search");

            migrationBuilder.DropTable(
                name: "user_account");
        }
    }
}
