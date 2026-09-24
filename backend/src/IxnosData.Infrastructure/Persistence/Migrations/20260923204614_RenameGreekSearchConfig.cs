using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IxnosData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameGreekSearchConfig : Migration
    {
        // The project was renamed from ixnos to ixnos-data. The generated search column refers to
        // the configuration by its object ID, so it keeps working through the rename; nothing
        // calls the unaccent helper by name.
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TEXT SEARCH CONFIGURATION ixnos_greek RENAME TO ixnos_data_greek;");
            migrationBuilder.Sql("ALTER FUNCTION ixnos_unaccent(text) RENAME TO ixnos_data_unaccent;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER FUNCTION ixnos_data_unaccent(text) RENAME TO ixnos_unaccent;");
            migrationBuilder.Sql("ALTER TEXT SEARCH CONFIGURATION ixnos_data_greek RENAME TO ixnos_greek;");
        }
    }
}
