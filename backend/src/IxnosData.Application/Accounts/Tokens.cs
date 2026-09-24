using System.Security.Cryptography;
using System.Text;

namespace IxnosData.Application.Accounts;

// Only the hashes are ever stored.
public static class Tokens
{
    public static string New() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
