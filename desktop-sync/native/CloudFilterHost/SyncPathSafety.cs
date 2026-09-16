using System.Text.RegularExpressions;

internal static class SyncPathSafety
{
    public static string Resolve(string root, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative)) throw new IOException("Caminho absoluto ou vazio.");
        var parts = relative.Replace('/', '\\').Split('\\');
        var full = Path.GetFullPath(root);
        foreach (var part in parts)
        {
            if (part.Length == 0 || part.Length > 255 || part is "." or ".." ||
                part.EndsWith('.') || part.EndsWith(' ') || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                Regex.IsMatch(part, @"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", RegexOptions.IgnoreCase))
                throw new IOException("Componente inválido.");
            full = Path.Combine(full, part);
            if (Directory.Exists(full) && (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Junção de diretório recusada.");
        }
        if (!Path.GetFullPath(full).StartsWith(Path.GetFullPath(root).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
            throw new IOException("Caminho fora da pasta sincronizada.");
        return full;
    }
    public static bool WasRemoved(string root, string relative, ISet<string> materialized)
    {
        var parts = relative.Split('\\');
        for (int i = 1; i <= parts.Length; i++)
        {
            var parent = string.Join("\\", parts.Take(i));
            if (materialized.Contains(parent) && !Path.Exists(Resolve(root, parent))) return true;
        }
        return false;
    }

    public static int RunSelfTest()
    {
        var root = Path.Combine(Path.GetTempPath(), "GesCon-self-test-" + Guid.NewGuid());
        Directory.CreateDirectory(root);
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "docs"));
            var state = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "docs" };
            if (WasRemoved(root, @"docs\new.txt", state)) throw new Exception("New file incorrectly blocked");
            Directory.Delete(Path.Combine(root, "docs"));
            if (!WasRemoved(root, @"docs\new.txt", state)) throw new Exception("Deleted parent would be recreated");
            var json = System.Text.Json.JsonSerializer.Serialize(state);
            var restored = System.Text.Json.JsonSerializer.Deserialize<HashSet<string>>(json)!;
            if (!WasRemoved(root, "docs", restored)) throw new Exception("Deletion lost on restart");
            foreach (var invalid in new[] { @"..\outside", @"C:\outside", @"docs\CON.txt", @"docs\bad:stream" })
            {
                bool refused = false;
                try { Resolve(root, invalid); } catch (IOException) { refused = true; }
                if (!refused) throw new Exception("Unsafe path accepted");
            }
            Console.WriteLine("OK: native deletion/restart/path tests");
            return 0;
        }
        finally { Directory.Delete(root, true); }
    }
}
