using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProcedureAndOffers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "contract_type",
                table: "procurement_item",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "offers_received",
                table: "procurement_item",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "procedure_type",
                table: "procurement_item",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            // Existing ΚΗΜΔΗΣ rows: the facts are already in the raw payload, so no refetch.
            migrationBuilder.Sql("""
                UPDATE procurement_item SET
                    procedure_type = nullif(raw->'procedureType'->>'key', ''),
                    contract_type = nullif(raw->'contractType'->>'key', ''),
                    offers_received = CASE WHEN raw->>'bidsSubmitted' ~ '^[0-9]{1,6}$' THEN (raw->>'bidsSubmitted')::int END
                WHERE source = 'khmdhs';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "contract_type",
                table: "procurement_item");

            migrationBuilder.DropColumn(
                name: "offers_received",
                table: "procurement_item");

            migrationBuilder.DropColumn(
                name: "procedure_type",
                table: "procurement_item");
        }
    }
}
