using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using NpgsqlTypes;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddItemsContractorsLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "contractor",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tax_id = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: true),
                    name = table.Column<string>(type: "text", nullable: false),
                    country_code = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_contractor", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "procurement_item",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    source_id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    keywords = table.Column<string>(type: "text", nullable: true),
                    text_normalised = table.Column<string>(type: "text", nullable: false),
                    search_key = table.Column<string>(type: "text", nullable: false),
                    amount_eur = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    amount_with_vat_eur = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    cpv_codes = table.Column<string[]>(type: "text[]", nullable: false),
                    nuts_code = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    organisation_id = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    signed_on = table.Column<DateOnly>(type: "date", nullable: true),
                    deadline_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    starts_on = table.Column<DateOnly>(type: "date", nullable: true),
                    ends_on = table.Column<DateOnly>(type: "date", nullable: true),
                    cancelled = table.Column<bool>(type: "boolean", nullable: false),
                    cancelled_on = table.Column<DateOnly>(type: "date", nullable: true),
                    source_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    raw = table.Column<string>(type: "jsonb", nullable: false),
                    ingested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    search = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "setweight(to_tsvector('ixnos_greek'::regconfig, title), 'A')\n|| setweight(to_tsvector('ixnos_greek'::regconfig, coalesce(description, '')), 'B')\n|| setweight(to_tsvector('ixnos_greek'::regconfig, coalesce(keywords, '')), 'C')", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_procurement_item", x => x.id);
                    table.ForeignKey(
                        name: "fk_procurement_item_organisation_organisation_id",
                        column: x => x.organisation_id,
                        principalTable: "organisation",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "item_contractor",
                columns: table => new
                {
                    item_id = table.Column<long>(type: "bigint", nullable: false),
                    contractor_id = table.Column<long>(type: "bigint", nullable: false),
                    role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    amount_eur = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_contractor", x => new { x.item_id, x.contractor_id, x.role });
                    table.ForeignKey(
                        name: "fk_item_contractor_contractor_contractor_id",
                        column: x => x.contractor_id,
                        principalTable: "contractor",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_item_contractor_procurement_items_item_id",
                        column: x => x.item_id,
                        principalTable: "procurement_item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "item_link",
                columns: table => new
                {
                    from_item_id = table.Column<long>(type: "bigint", nullable: false),
                    relation = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    to_source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    to_source_id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    to_item_id = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_link", x => new { x.from_item_id, x.relation, x.to_source, x.to_source_id });
                    table.ForeignKey(
                        name: "fk_item_link_procurement_items_from_item_id",
                        column: x => x.from_item_id,
                        principalTable: "procurement_item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_item_link_procurement_items_to_item_id",
                        column: x => x.to_item_id,
                        principalTable: "procurement_item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_contractor_tax_id",
                table: "contractor",
                column: "tax_id",
                unique: true,
                filter: "tax_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_item_contractor_contractor_id",
                table: "item_contractor",
                column: "contractor_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_link_to_item_id",
                table: "item_link",
                column: "to_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_link_to_source_to_source_id",
                table: "item_link",
                columns: new[] { "to_source", "to_source_id" });

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_cpv_codes",
                table: "procurement_item",
                column: "cpv_codes")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_ingested_at",
                table: "procurement_item",
                column: "ingested_at");

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_kind_published_at",
                table: "procurement_item",
                columns: new[] { "kind", "published_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_nuts_code",
                table: "procurement_item",
                column: "nuts_code");

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_organisation_id_published_at",
                table: "procurement_item",
                columns: new[] { "organisation_id", "published_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_published_at",
                table: "procurement_item",
                column: "published_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_search",
                table: "procurement_item",
                column: "search")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_search_key",
                table: "procurement_item",
                column: "search_key")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_source_source_id",
                table: "procurement_item",
                columns: new[] { "source", "source_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_procurement_item_text_normalised",
                table: "procurement_item",
                column: "text_normalised")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "item_contractor");

            migrationBuilder.DropTable(
                name: "item_link");

            migrationBuilder.DropTable(
                name: "contractor");

            migrationBuilder.DropTable(
                name: "procurement_item");
        }
    }
}
