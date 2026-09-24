using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReferenceTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "cpv_code",
                columns: table => new
                {
                    code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    parent_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    level = table.Column<short>(type: "smallint", nullable: false),
                    label_el = table.Column<string>(type: "text", nullable: false),
                    label_en = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cpv_code", x => x.code);
                    table.ForeignKey(
                        name: "fk_cpv_code_cpv_code_parent_code",
                        column: x => x.parent_code,
                        principalTable: "cpv_code",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "nuts_region",
                columns: table => new
                {
                    code = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    parent_code = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    level = table.Column<short>(type: "smallint", nullable: false),
                    label_el = table.Column<string>(type: "text", nullable: false),
                    label_en = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nuts_region", x => x.code);
                    table.ForeignKey(
                        name: "fk_nuts_region_nuts_region_parent_code",
                        column: x => x.parent_code,
                        principalTable: "nuts_region",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_cpv_code_parent_code",
                table: "cpv_code",
                column: "parent_code");

            migrationBuilder.CreateIndex(
                name: "ix_nuts_region_parent_code",
                table: "nuts_region",
                column: "parent_code");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cpv_code");

            migrationBuilder.DropTable(
                name: "nuts_region");
        }
    }
}
