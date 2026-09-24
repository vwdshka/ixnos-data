using System.Globalization;
using System.Net;
using System.Text;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Accounts;
using IxnosData.Application.Search;
using IxnosData.Domain.Alerts;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Application.Alerts;

public sealed record DigestResult(int Users, int Emails, int Records, int Failed);

// Deliveries and checkpoints are committed before any email goes out, so a crash or a rerun can't
// send a record twice.
public sealed class DigestHandler(IAccountsDbContext db, IItemQueries items, IEmailSender email, TimeProvider clock, WebLinks links)
{
    public const int MaxPerSearch = 20;

    public async Task<DigestResult> RunAsync(CancellationToken cancellationToken)
    {
        var started = clock.GetUtcNow();
        var users = await db.UserAccounts
            .Where(u => db.SavedSearches.Any(s => s.UserId == u.Id))
            .ToListAsync(cancellationToken);
        int emails = 0, records = 0, failed = 0;

        foreach (var user in users)
        {
            // Weekly digests wait for Monday and then cover the whole week. Paused searches move
            // their checkpoint on, so resuming doesn't send what was published meanwhile.
            if (user.DigestFrequency == DigestFrequency.Weekly && clock.GetLocalNow().DayOfWeek != DayOfWeek.Monday)
            {
                continue;
            }

            if (user.DigestFrequency == DigestFrequency.Paused)
            {
                await db.SavedSearches
                    .Where(s => s.UserId == user.Id)
                    .ExecuteUpdateAsync(set => set.SetProperty(s => s.CheckedUpTo, started), cancellationToken);
                continue;
            }

            var searches = await db.SavedSearches.Where(s => s.UserId == user.Id).OrderBy(s => s.CreatedAt).ToListAsync(cancellationToken);
            var sections = new List<(SavedSearch Search, IReadOnlyList<ItemSummary> Items)>();
            foreach (var search in searches)
            {
                var found = await NewItemsAsync(search, cancellationToken);
                var sent = await db.AlertDeliveries
                    .Where(d => d.SavedSearchId == search.Id)
                    .Select(d => d.ItemSourceId)
                    .Where(id => found.Select(i => i.SourceId).Contains(id))
                    .ToListAsync(cancellationToken);
                var fresh = found.Where(i => !sent.Contains(i.SourceId)).ToList();
                search.CheckedUpTo = started;
                if (fresh.Count > 0)
                {
                    sections.Add((search, fresh));
                    db.AlertDeliveries.AddRange(fresh.Select(i => new AlertDelivery { SavedSearchId = search.Id, ItemSourceId = i.SourceId, SentAt = started }));
                }
            }

            await db.SaveChangesAsync(cancellationToken);
            if (sections.Count == 0)
            {
                continue;
            }

            var (subject, text, html) = Compose(user, sections);
            try
            {
                await email.SendAsync(user.Email, subject, text, html, cancellationToken);
                emails++;
                records += sections.Sum(s => s.Items.Count);
            }
#pragma warning disable CA1031 // One failed address must not stop everyone else's digest.
            catch (Exception)
#pragma warning restore CA1031
            {
                failed++;
            }
        }

        return new DigestResult(users.Count, emails, records, failed);
    }

    private async Task<IReadOnlyList<ItemSummary>> NewItemsAsync(SavedSearch search, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var criteria = SearchItemsHandler.Interpret(
            new SearchItemsRequest(search.Query, search.Kind is null ? null : [search.Kind], search.Cpv, search.Nuts,
                null, search.MinAmount, search.MaxAmount, null, null, 1, MaxPerSearch, "newest"),
            errors);
        if (errors.Count > 0)
        {
            return [];
        }

        var result = await items.SearchAsync(criteria with { IngestedAfter = search.CheckedUpTo }, cancellationToken);
        return result.Items;
    }

    private (string Subject, string Text, string Html) Compose(
        UserAccount user, List<(SavedSearch Search, IReadOnlyList<ItemSummary> Items)> sections)
    {
        var en = user.Locale == "en";
        var culture = CultureInfo.GetCultureInfo(en ? "en-GB" : "el-GR");
        var count = sections.Sum(s => s.Items.Count);
        var subject = en ? $"ixnos-data: {count} new records for your searches" : $"ixnos-data: {count} νέες πράξεις για τις αναζητήσεις σας";
        var text = new StringBuilder();
        var html = new StringBuilder("<div style=\"font-family:sans-serif;max-width:640px\">");

        foreach (var (search, found) in sections)
        {
            text.AppendLine(CultureInfo.InvariantCulture, $"== {search.Name}");
            html.Append(CultureInfo.InvariantCulture, $"<h2 style=\"font-size:16px\">{WebUtility.HtmlEncode(search.Name)}</h2><ul>");
            foreach (var item in found)
            {
                var url = links.Page(user.Locale, "/items/" + Uri.EscapeDataString(item.SourceId));
                var amount = (item.AmountEur ?? item.AmountWithVatEur)?.ToString("C0", culture);
                var facts = string.Join(" · ", new[] { item.Organisation?.Name, amount }.Where(f => f is not null));
                text.AppendLine(CultureInfo.InvariantCulture, $"- {item.Title}\n  {facts}\n  {url}");
                html.Append(CultureInfo.InvariantCulture,
                    $"<li><a href=\"{url}\">{WebUtility.HtmlEncode(item.Title)}</a><br><small>{WebUtility.HtmlEncode(facts)}</small></li>");
            }

            text.AppendLine();
            html.Append("</ul>");
        }

        var account = links.Page(user.Locale, "/account");
        var footer = en ? $"Manage or stop these alerts: {account}" : $"Διαχείριση ή διακοπή των ειδοποιήσεων: {account}";
        text.AppendLine(footer);
        html.Append(CultureInfo.InvariantCulture, $"<p><small><a href=\"{account}\">{WebUtility.HtmlEncode(footer.Split(':')[0])}</a></small></p></div>");
        return (subject, text.ToString(), html.ToString());
    }
}
