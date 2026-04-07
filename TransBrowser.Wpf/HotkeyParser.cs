using System.Windows.Input;

namespace TransBrowser.Wpf;

[Flags]
public enum KeyModifiers
{
    None = 0,
    Alt = 1,
    Ctrl = 2,
    Shift = 4,
    Win = 8
}

public static class HotkeyParser
{
    private static readonly Dictionary<string, Key> KeyMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["A"] = Key.A, ["B"] = Key.B, ["C"] = Key.C, ["D"] = Key.D, ["E"] = Key.E,
        ["F"] = Key.F, ["G"] = Key.G, ["H"] = Key.H, ["I"] = Key.I, ["J"] = Key.J,
        ["K"] = Key.K, ["L"] = Key.L, ["M"] = Key.M, ["N"] = Key.N, ["O"] = Key.O,
        ["P"] = Key.P, ["Q"] = Key.Q, ["R"] = Key.R, ["S"] = Key.S, ["T"] = Key.T,
        ["U"] = Key.U, ["V"] = Key.V, ["W"] = Key.W, ["X"] = Key.X, ["Y"] = Key.Y,
        ["Z"] = Key.Z,
        ["0"] = Key.D0, ["1"] = Key.D1, ["2"] = Key.D2, ["3"] = Key.D3, ["4"] = Key.D4,
        ["5"] = Key.D5, ["6"] = Key.D6, ["7"] = Key.D7, ["8"] = Key.D8, ["9"] = Key.D9,
        ["F1"] = Key.F1, ["F2"] = Key.F2, ["F3"] = Key.F3, ["F4"] = Key.F4,
        ["F5"] = Key.F5, ["F6"] = Key.F6, ["F7"] = Key.F7, ["F8"] = Key.F8,
        ["F9"] = Key.F9, ["F10"] = Key.F10, ["F11"] = Key.F11, ["F12"] = Key.F12,
        ["Up"] = Key.Up, ["Down"] = Key.Down, ["Left"] = Key.Left, ["Right"] = Key.Right,
        ["Space"] = Key.Space, ["Tab"] = Key.Tab, ["Enter"] = Key.Enter,
        ["Escape"] = Key.Escape, ["Esc"] = Key.Escape,
        ["Delete"] = Key.Delete, ["Del"] = Key.Delete,
        ["Insert"] = Key.Insert, ["Ins"] = Key.Insert,
        ["Home"] = Key.Home, ["End"] = Key.End,
        ["PageUp"] = Key.PageUp, ["PageDown"] = Key.PageDown,
        ["Back"] = Key.Back, ["Backspace"] = Key.Back,
        ["OemTilde"] = Key.OemTilde, ["OemMinus"] = Key.OemMinus, ["OemPlus"] = Key.OemPlus,
    };

    private static readonly Dictionary<Key, string> KeyNameMap;

    static HotkeyParser()
    {
        KeyNameMap = new Dictionary<Key, string>();
        foreach (var kv in KeyMap)
        {
            if (!KeyNameMap.ContainsKey(kv.Value))
                KeyNameMap[kv.Value] = kv.Key;
        }
        // Override some display names
        KeyNameMap[Key.D0] = "0"; KeyNameMap[Key.D1] = "1"; KeyNameMap[Key.D2] = "2";
        KeyNameMap[Key.D3] = "3"; KeyNameMap[Key.D4] = "4"; KeyNameMap[Key.D5] = "5";
        KeyNameMap[Key.D6] = "6"; KeyNameMap[Key.D7] = "7"; KeyNameMap[Key.D8] = "8";
        KeyNameMap[Key.D9] = "9";
        KeyNameMap[Key.Escape] = "Escape";
        KeyNameMap[Key.Delete] = "Delete";
        KeyNameMap[Key.Insert] = "Insert";
    }

    public static bool TryParse(string hotkeyStr, out KeyModifiers modifiers, out Key key)
    {
        modifiers = KeyModifiers.None;
        key = Key.None;

        if (string.IsNullOrWhiteSpace(hotkeyStr))
            return false;

        var parts = hotkeyStr.Split('+');
        if (parts.Length == 0) return false;

        var keyPart = parts[^1].Trim();

        for (int i = 0; i < parts.Length - 1; i++)
        {
            var mod = parts[i].Trim();
            switch (mod.ToLowerInvariant())
            {
                case "ctrl": case "control": modifiers |= KeyModifiers.Ctrl; break;
                case "alt": modifiers |= KeyModifiers.Alt; break;
                case "shift": modifiers |= KeyModifiers.Shift; break;
                case "win": case "windows": modifiers |= KeyModifiers.Win; break;
                default: return false;
            }
        }

        if (!KeyMap.TryGetValue(keyPart, out key))
            return false;

        return true;
    }

    public static string Format(KeyModifiers modifiers, Key key)
    {
        var parts = new List<string>();
        if (modifiers.HasFlag(KeyModifiers.Ctrl)) parts.Add("Ctrl");
        if (modifiers.HasFlag(KeyModifiers.Alt)) parts.Add("Alt");
        if (modifiers.HasFlag(KeyModifiers.Shift)) parts.Add("Shift");
        if (modifiers.HasFlag(KeyModifiers.Win)) parts.Add("Win");
        parts.Add(KeyNameMap.TryGetValue(key, out var name) ? name : key.ToString());
        return string.Join("+", parts);
    }
}
