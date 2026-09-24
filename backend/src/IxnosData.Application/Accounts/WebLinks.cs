namespace IxnosData.Application.Accounts;

// Links in emails point at the web app, with the /en prefix for English.
public sealed record WebLinks(Uri BaseUrl)
{
    public Uri Page(string locale, string path) =>
        new(BaseUrl, (locale == "el" ? string.Empty : "/" + locale) + path);
}
