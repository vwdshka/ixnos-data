using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExtensionsAndGreekSearchConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,")
                .Annotation("Npgsql:PostgresExtension:unaccent", ",,");

            // unaccent() is STABLE, so it cannot be used in indexes or generated columns.
            // This wrapper pins the dictionary, which makes it safe to declare IMMUTABLE.
            migrationBuilder.Sql("""
                CREATE FUNCTION ixnos_unaccent(text) RETURNS text
                LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
                RETURN public.unaccent('public.unaccent'::regdictionary, $1);
                """);

            // Greek full-text search: Greek words lose accents, then go through the Snowball
            // Greek stemmer (which also folds final sigma). Latin-script words are only
            // lowercased. Queries always name this config, so it can be tuned (for example
            // with a stopword list) without touching them.
            migrationBuilder.Sql("""
                CREATE TEXT SEARCH CONFIGURATION ixnos_greek (COPY = pg_catalog.greek);
                ALTER TEXT SEARCH CONFIGURATION ixnos_greek
                    ALTER MAPPING FOR word, hword, hword_part WITH public.unaccent, greek_stem;
                ALTER TEXT SEARCH CONFIGURATION ixnos_greek
                    ALTER MAPPING FOR asciiword, asciihword, hword_asciipart WITH simple;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TEXT SEARCH CONFIGURATION IF EXISTS ixnos_greek;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS ixnos_unaccent(text);");
        }
    }
}
