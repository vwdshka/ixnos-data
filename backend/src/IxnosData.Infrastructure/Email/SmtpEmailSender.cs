using System.Net;
using System.Net.Mail;
using IxnosData.Application.Abstractions;
using Microsoft.Extensions.Configuration;

namespace IxnosData.Infrastructure.Email;

// Any SMTP provider works. Without a host, mail is written as .eml files to the pickup folder,
// which is how you read sign-in links locally.
public sealed class SmtpEmailSender(IConfiguration configuration) : IEmailSender
{
    public async Task SendAsync(string recipient, string subject, string text, string html, CancellationToken cancellationToken)
    {
        var section = configuration.GetSection("Email");
        using var message = new MailMessage(section["From"] ?? "ixnos-data <no-reply@localhost>", recipient)
        {
            Subject = subject,
            Body = text,
        };
        message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(html, null, "text/html"));

        using var client = new SmtpClient();
        var host = section["Smtp:Host"];
        if (string.IsNullOrEmpty(host))
        {
            // The temp folder is writable even for the containers' non-root user.
            var directory = Path.GetFullPath(section["PickupDirectory"] ?? Path.Combine(Path.GetTempPath(), "ixnos-data-mail"));
            Directory.CreateDirectory(directory);
            client.DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory;
            client.PickupDirectoryLocation = directory;
        }
        else
        {
            client.Host = host;
            client.Port = int.TryParse(section["Smtp:Port"], out var port) ? port : 587;
            client.EnableSsl = !string.Equals(section["Smtp:EnableSsl"], "false", StringComparison.OrdinalIgnoreCase);
            client.Credentials = new NetworkCredential(section["Smtp:Username"], section["Smtp:Password"]);
        }

        await client.SendMailAsync(message, cancellationToken);
    }
}
