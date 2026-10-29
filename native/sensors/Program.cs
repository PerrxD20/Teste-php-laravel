using System.Globalization;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.PawnIo;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static TextWriter ProtocolOutput = TextWriter.Null;

    private static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        ProtocolOutput = Console.Out;
        // Third-party diagnostics must not corrupt the NDJSON protocol.
        Console.SetOut(Console.Error);
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
        using var collector = new SensorCollector();
        if (args.Contains("--version"))
        {
            await Write(new { protocolVersion = 1, source = SensorCollector.Source, libraryVersion = SensorCollector.LibraryVersion, collectorVersion = "1.0.0" });
            return 0;
        }
        if (args.Length == 0 || args.Contains("--once"))
        {
            await Write(collector.Sample(null));
            return 0;
        }
        if (args.Contains("--status"))
        {
            await Write(collector.Status(null));
            return 0;
        }
        if (!args.Contains("--stdio"))
        {
            await Write(collector.Failure(null, "Argumento não reconhecido. Use --stdio, --once, --status ou --version."));
            return 2;
        }
        while (await Console.In.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (line.Length > 4096) { await Write(collector.Failure(null, "Requisição maior que o limite de 4096 caracteres.")); continue; }
            object? id = null;
            try
            {
                using var document = JsonDocument.Parse(line);
                var root = document.RootElement;
                if (root.TryGetProperty("id", out var requestId)) id = requestId.Clone();
                var command = root.TryGetProperty("command", out var requested) ? requested.GetString() : null;
                if (command == "close") break;
                await Write(command switch
                {
                    "sample" => collector.Sample(id),
                    "status" => collector.Status(id),
                    _ => collector.Failure(id, "Comando não reconhecido. Apenas sample, status e close são aceitos.")
                });
            }
            catch (Exception error) when (error is JsonException or InvalidOperationException)
            {
                await Write(collector.Failure(id, "Requisição JSON inválida."));
            }
        }
        return 0;
    }

    private static async Task Write(object response)
    {
        await ProtocolOutput.WriteLineAsync(JsonSerializer.Serialize(response, JsonOptions));
        await ProtocolOutput.FlushAsync();
    }
}

internal sealed class SensorCollector : IDisposable
{
    internal const string Source = "LibreHardwareMonitorLib";
    internal const string LibraryVersion = "0.9.6";
    private Computer? _computer;
    private bool _openAttempted;
    private string? _openError;
    private readonly HashSet<string> _updateDiagnostics = [];

    public CollectorResponse Status(object? id)
    {
        var response = MakeResponse(id);
        response.StatusOnly = true;
        response.State = OperatingSystem.IsWindows() ? "ok" : "unavailable";
        return response;
    }

    public CollectorResponse Failure(object? id, string message)
    {
        var response = MakeResponse(id);
        response.State = "unavailable";
        response.Diagnostics.Add(message);
        return response;
    }

    public CollectorResponse Sample(object? id)
    {
        var response = MakeResponse(id);
        if (!OperatingSystem.IsWindows()) return response;
        if (!_openAttempted)
        {
            _openAttempted = true;
            try
            {
                _computer = new Computer
                {
                    IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true,
                    IsMotherboardEnabled = true, IsControllerEnabled = true,
                    IsStorageEnabled = true, IsBatteryEnabled = true,
                    IsPsuEnabled = true, IsPowerMonitorEnabled = true,
                    IsNetworkEnabled = false
                };
                _computer.Open();
            }
            catch (Exception error)
            {
                _openError = "O mecanismo de sensores não pôde inicializar (" + error.GetType().Name + "). Verifique as permissões e a compatibilidade do hardware.";
                try { _computer?.Close(); } catch { }
                _computer = null;
            }
        }
        if (_computer == null)
        {
            response.Diagnostics.Add(_openError ?? "O mecanismo de sensores está indisponível.");
            return response;
        }
        _updateDiagnostics.Clear();
        try
        {
            var seen = new HashSet<string>();
            foreach (var hardware in _computer.Hardware.ToArray()) ReadHardware(hardware, response, seen, 0);
        }
        catch (Exception error)
        {
            response.Diagnostics.Add("A enumeração de sensores foi interrompida (" + error.GetType().Name + "). Algumas leituras podem estar indisponíveis.");
        }
        response.Diagnostics.AddRange(_updateDiagnostics);
        if (!response.Sensors.Any(sensor => sensor.Type == "Temperature" && sensor.Value.HasValue))
            response.Diagnostics.Add("Nenhum sensor de temperatura acessível nesta leitura. Isso pode ocorrer por permissões, driver ausente ou ambiente virtual.");
        if (response.Sensors.Any(sensor => sensor.Value.HasValue))
            response.State = response.Diagnostics.Count == 0 ? "ok" : "partial";
        return response;
    }

    private void ReadHardware(IHardware hardware, CollectorResponse response, HashSet<string> seen, int depth)
    {
        if (depth > 8 || response.Sensors.Count >= 8192 || seen.Count >= 512) return;
        var identifier = hardware.Identifier.ToString();
        if (!seen.Add(identifier)) return;
        var updated = true;
        try { hardware.Update(); }
        catch (Exception error)
        {
            updated = false;
            _updateDiagnostics.Add("Não foi possível atualizar " + hardware.Name + " (" + error.GetType().Name + ").");
        }
        if (updated)
        {
            foreach (var sensor in hardware.Sensors.ToArray())
            {
                if (response.Sensors.Count >= 8192) break;
                // Reading sensor values never calls IControl or changes parameters.
                response.Sensors.Add(new SensorReading(
                    sensor.Name, Finite(sensor.Value), Finite(sensor.Min), Finite(sensor.Max),
                    sensor.Identifier.ToString(), hardware.Name, hardware.HardwareType.ToString(),
                    sensor.SensorType.ToString(), Unit(sensor.SensorType), identifier));
            }
        }
        foreach (var child in hardware.SubHardware.ToArray()) ReadHardware(child, response, seen, depth + 1);
    }

    private static CollectorResponse MakeResponse(object? id)
    {
        var response = new CollectorResponse { Id = id };
        if (!OperatingSystem.IsWindows())
        {
            response.Diagnostics.Add("Este coletor nativo de sensores é específico para Windows.");
            return response;
        }
        var elevated = false;
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            elevated = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch { response.Diagnostics.Add("Não foi possível determinar a permissão administrativa desta sessão."); }
        var installed = false;
        string? pawnVersion = null;
        try { installed = PawnIo.IsInstalled; pawnVersion = PawnIo.Version?.ToString(); }
        catch { response.Diagnostics.Add("Não foi possível consultar a instalação do driver PawnIO."); }
        response.Capabilities = new(elevated, installed, pawnVersion);
        if (!installed) response.Diagnostics.Add("PawnIO não está instalado. Sensores de CPU e placa-mãe podem exigir a instalação opcional do driver oficial.");
        else if (Version.TryParse(pawnVersion, out var version) && version < new Version(2, 0, 0, 0))
            response.Diagnostics.Add("O driver PawnIO instalado é antigo; LibreHardwareMonitorLib 0.9.6 requer PawnIO 2.0 ou superior.");
        if (!elevated) response.Diagnostics.Add("Alguns sensores exigem abrir o Mello como administrador. O coletor não eleva permissões automaticamente.");
        return response;
    }

    private static double? Finite(float? value) => value.HasValue && float.IsFinite(value.Value) ? value.Value : null;
    private static string Unit(SensorType type) => type switch
    {
        SensorType.Temperature => "°C", SensorType.Fan => "RPM", SensorType.Voltage => "V",
        SensorType.Current => "A", SensorType.Power => "W", SensorType.Clock => "MHz",
        SensorType.Frequency => "Hz", SensorType.Load or SensorType.Control or SensorType.Level => "%",
        SensorType.Flow => "L/h", SensorType.Data => "GiB", SensorType.SmallData => "MiB",
        SensorType.Throughput => "B/s", SensorType.TimeSpan => "s", SensorType.Timing => "ns",
        SensorType.Energy => "mWh", SensorType.Noise => "dBA", SensorType.Conductivity => "µS/cm",
        SensorType.Humidity => "%", _ => ""
    };

    public void Dispose()
    {
        try { _computer?.Close(); } catch { }
        _computer = null;
    }
}

internal sealed class CollectorResponse
{
    public int ProtocolVersion { get; } = 1;
    public string Source { get; } = SensorCollector.Source;
    public string LibraryVersion { get; } = SensorCollector.LibraryVersion;
    public string CollectorVersion { get; } = "1.0.0";
    public object? Id { get; init; }
    public string State { get; set; } = "unavailable";
    public DateTimeOffset CollectedAt { get; } = DateTimeOffset.UtcNow;
    public bool StatusOnly { get; set; }
    public CollectorCapabilities Capabilities { get; set; } = new(false, false, null);
    public List<SensorReading> Sensors { get; } = [];
    public List<string> Diagnostics { get; } = [];
}
internal sealed record CollectorCapabilities(bool Elevated, bool PawnIOInstalled, string? PawnIOVersion);
internal sealed record SensorReading(string Name, double? Value, double? Min, double? Max, string Identifier,
    string Hardware, string HardwareType, string Type, string Unit, string HardwareIdentifier);
