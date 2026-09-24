using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganisation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "organisation",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    name_el = table.Column<string>(type: "text", nullable: false),
                    name_en = table.Column<string>(type: "text", nullable: true),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    tax_id = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: true),
                    parent_id = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    nuts_code = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    website = table.Column<string>(type: "text", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_organisation", x => x.id);
                    table.ForeignKey(
                        name: "fk_organisation_organisation_parent_id",
                        column: x => x.parent_id,
                        principalTable: "organisation",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_organisation_parent_id",
                table: "organisation",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_organisation_tax_id",
                table: "organisation",
                column: "tax_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "organisation");
        }
    }
}
