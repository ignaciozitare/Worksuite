using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration.GetSection("FuelAdjustment").Get<FuelAdjustmentOptions>() ?? new FuelAdjustmentOptions();
builder.Services.AddSingleton(cfg);
builder.Services.AddHttpClient();

var app = builder.Build();

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(cfg.DatabasePath)) ?? ".");
Db.Init(cfg.DatabasePath);
Db.SeedSegments(cfg.DatabasePath);

app.MapGet("/", () => Results.Redirect("/dashboard"));

app.MapGet("/api/config", (FuelAdjustmentOptions options) => Results.Ok(options));

app.MapPost("/api/brent/refresh", async (IHttpClientFactory httpFactory, FuelAdjustmentOptions options) =>
{
    if (!options.Enabled) return Results.BadRequest(new { message = "Feature disabled" });

    var client = httpFactory.CreateClient();
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; FuelAdjustments/1.0)");

    string html;
    try
    {
        html = await client.GetStringAsync(options.BrentUrl);
    }
    catch (Exception ex)
    {
        return Results.Problem($"Error downloading Brent source: {ex.Message}");
    }

    var match = Regex.Match(html, "class=\"YMlKec fxKbKc\">([^<]+)</div>");
    if (!match.Success) return Results.Problem("Could not parse price from Google Finance response.");

    var raw = match.Groups[1].Value.Replace("$", "").Replace(",", "").Trim();
    if (!decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var price))
        return Results.Problem($"Invalid price parsed: {raw}");

    var now = DateTimeOffset.UtcNow;
    var snapshotId = Db.InsertSnapshot(options.DatabasePath, price, now, options.BrentProvider);

    return Results.Ok(new { snapshotId, priceUsd = price, timestampUtc = now, source = options.BrentProvider });
});

app.MapGet("/api/brent/latest", (FuelAdjustmentOptions options) =>
{
    var snapshot = Db.GetLatestSnapshot(options.DatabasePath);
    return snapshot is null ? Results.NotFound() : Results.Ok(snapshot);
});

app.MapPost("/api/adjustments/run-dx", (FuelAdjustmentOptions options, DateTime? processingDateUtc) =>
{
    if (!options.Enabled) return Results.Ok(new { message = "Feature disabled", processed = 0 });

    var snapshot = Db.GetLatestSnapshot(options.DatabasePath);
    if (snapshot is null) return Results.BadRequest(new { message = "No Brent snapshot available" });

    var tier = TierMatcher.Find(options.Tiers, snapshot.PriceUsd);
    if (tier is null) return Results.BadRequest(new { message = "No tier matches current Brent value", snapshot.PriceUsd });

    var today = processingDateUtc?.Date ?? DateTime.UtcNow.Date;
    var departureDate = today.AddDays(options.DaysBeforeDeparture);
    var segments = Db.GetSegmentsForDate(options.DatabasePath, departureDate);

    var processed = 0;
    foreach (var segment in segments)
    {
        if (Db.ExistsAdjustment(options.DatabasePath, segment.SegmentId, departureDate))
            continue;

        var total = tier.EuroPerPax * segment.PassengerCount;
        var action = total > 0 ? "charge" : total < 0 ? "refund" : "none";

        Db.InsertAdjustment(options.DatabasePath, new FuelAdjustmentRow(
            null,
            segment.SegmentId,
            segment.RecordLocator,
            segment.DepartureDate,
            segment.PassengerCount,
            snapshot.SnapshotId,
            snapshot.PriceUsd,
            snapshot.CapturedAtUtc,
            snapshot.Source,
            tier.BandLabel,
            $"({tier.LowerExclusive}, {(tier.UpperInclusive?.ToString(CultureInfo.InvariantCulture) ?? "+∞")}]",
            tier.EuroPerPax,
            total,
            action,
            "success",
            "Processed at D-X"
        ));
        processed++;
    }

    return Results.Ok(new
    {
        processingDateUtc = today,
        targetDepartureDateUtc = departureDate,
        snapshot = new { snapshot.PriceUsd, snapshot.CapturedAtUtc, snapshot.Source },
        tier = new { tier.BandLabel, tier.LowerExclusive, tier.UpperInclusive, tier.EuroPerPax },
        processed
    });
});

app.MapGet("/api/adjustments", (FuelAdjustmentOptions options) => Results.Ok(Db.GetAdjustments(options.DatabasePath)));

app.MapGet("/dashboard", (FuelAdjustmentOptions options) =>
{
    var snapshot = Db.GetLatestSnapshot(options.DatabasePath);
    var adjustments = Db.GetAdjustments(options.DatabasePath).Take(100).ToList();
    var segments = Db.GetAllSegments(options.DatabasePath);

    var html = new StringBuilder();
    html.Append("<html><head><title>Fuel Adjustment Dashboard</title><style>body{font-family:Arial;margin:20px;}table{border-collapse:collapse;width:100%;margin-bottom:24px;}th,td{border:1px solid #ddd;padding:8px;font-size:13px;}th{background:#f3f3f3;text-align:left;} .muted{color:#666;} code{background:#f3f3f3;padding:2px 4px;}</style></head><body>");
    html.Append("<h1>Brent-based Fuel Adjustment</h1>");
    html.Append($"<p>Feature: <b>{(options.Enabled ? "ON" : "OFF")}</b> | D-X: <b>{options.DaysBeforeDeparture}</b> | Provider: <b>{options.BrentProvider}</b></p>");
    if (snapshot is null)
        html.Append("<p class='muted'>No Brent snapshot yet. Call <code>POST /api/brent/refresh</code>.</p>");
    else
        html.Append($"<p>Latest Brent: <b>${snapshot.PriceUsd}</b> @ {snapshot.CapturedAtUtc:u} ({snapshot.Source})</p>");

    html.Append("<h2>Configured tiers</h2><table><tr><th>Band</th><th>Range (USD/bbl)</th><th>€/pax</th></tr>");
    foreach (var t in options.Tiers)
        html.Append($"<tr><td>{t.BandLabel}</td><td>({t.LowerExclusive}, {(t.UpperInclusive?.ToString() ?? "+∞")}]</td><td>{t.EuroPerPax}</td></tr>");
    html.Append("</table>");

    html.Append("<h2>Segments</h2><table><tr><th>SegmentId</th><th>RecordLocator</th><th>DepartureDate (UTC)</th><th>Pax</th></tr>");
    foreach (var s in segments)
        html.Append($"<tr><td>{s.SegmentId}</td><td>{s.RecordLocator}</td><td>{s.DepartureDate:yyyy-MM-dd}</td><td>{s.PassengerCount}</td></tr>");
    html.Append("</table>");

    html.Append("<h2>Adjustment audit</h2><table><tr><th>Segment</th><th>PNR</th><th>Departure</th><th>Brent</th><th>Band</th><th>€/pax</th><th>Total €</th><th>Action</th><th>Status</th><th>Timestamp</th></tr>");
    foreach (var a in adjustments)
        html.Append($"<tr><td>{a.SegmentId}</td><td>{a.RecordLocator}</td><td>{a.DepartureDate:yyyy-MM-dd}</td><td>{a.BrentPriceUsd}</td><td>{a.BandLabel} {a.BandRange}</td><td>{a.EuroPerPax}</td><td>{a.TotalAdjustment}</td><td>{a.ActionType}</td><td>{a.ExecutionStatus}</td><td>{a.BrentCapturedAtUtc:u}</td></tr>");
    html.Append("</table></body></html>");

    return Results.Content(html.ToString(), "text/html");
});

app.Run();

record FuelAdjustmentOptions
{
    public bool Enabled { get; init; } = true;
    public int DaysBeforeDeparture { get; init; } = 5;
    public int BrentRefreshTimesPerDay { get; init; } = 4;
    public string BrentProvider { get; init; } = "GoogleFinance";
    public string BrentUrl { get; init; } = "https://www.google.com/finance/quote/BZW00:NYMEX";
    public string DatabasePath { get; init; } = "fuel_adjustments.db";
    public List<Tier> Tiers { get; init; } = [];
}

record Tier(string BandLabel, decimal LowerExclusive, decimal? UpperInclusive, decimal EuroPerPax);

record BrentSnapshot(long SnapshotId, decimal PriceUsd, DateTimeOffset CapturedAtUtc, string Source);
record SegmentRow(long SegmentId, string RecordLocator, DateTime DepartureDate, int PassengerCount);
record FuelAdjustmentRow(
    long? Id,
    long SegmentId,
    string RecordLocator,
    DateTime DepartureDate,
    int PassengerCount,
    long SnapshotId,
    decimal BrentPriceUsd,
    DateTimeOffset BrentCapturedAtUtc,
    string BrentSource,
    string BandLabel,
    string BandRange,
    decimal EuroPerPax,
    decimal TotalAdjustment,
    string ActionType,
    string ExecutionStatus,
    string Reason
);

static class TierMatcher
{
    public static Tier? Find(IEnumerable<Tier> tiers, decimal value)
    {
        return tiers.FirstOrDefault(t => value > t.LowerExclusive && (!t.UpperInclusive.HasValue || value <= t.UpperInclusive));
    }
}

static class Db
{
    public static void Init(string dbPath)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();

        var cmd = con.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS brent_snapshots (
                snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
                price_usd REAL NOT NULL,
                captured_at_utc TEXT NOT NULL,
                source TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS segments (
                segment_id INTEGER PRIMARY KEY,
                record_locator TEXT NOT NULL,
                departure_date_utc TEXT NOT NULL,
                passenger_count INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fuel_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                segment_id INTEGER NOT NULL,
                record_locator TEXT NOT NULL,
                departure_date_utc TEXT NOT NULL,
                passenger_count INTEGER NOT NULL,
                snapshot_id INTEGER NOT NULL,
                brent_price_usd REAL NOT NULL,
                brent_captured_at_utc TEXT NOT NULL,
                brent_source TEXT NOT NULL,
                band_label TEXT NOT NULL,
                band_range TEXT NOT NULL,
                euro_per_pax REAL NOT NULL,
                total_adjustment REAL NOT NULL,
                action_type TEXT NOT NULL,
                execution_status TEXT NOT NULL,
                reason TEXT NOT NULL,
                UNIQUE(segment_id, departure_date_utc)
            );";
        cmd.ExecuteNonQuery();
    }

    public static void SeedSegments(string dbPath)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();

        var check = con.CreateCommand();
        check.CommandText = "SELECT COUNT(*) FROM segments";
        var count = Convert.ToInt32(check.ExecuteScalar());
        if (count > 0) return;

        var today = DateTime.UtcNow.Date;
        var samples = new[]
        {
            new SegmentRow(1001, "ABC123", today.AddDays(5), 2),
            new SegmentRow(1002, "ABC123", today.AddDays(6), 2),
            new SegmentRow(1003, "ZXV987", today.AddDays(5), 1)
        };

        foreach (var s in samples)
        {
            var cmd = con.CreateCommand();
            cmd.CommandText = "INSERT INTO segments(segment_id, record_locator, departure_date_utc, passenger_count) VALUES ($id,$rl,$d,$p)";
            cmd.Parameters.AddWithValue("$id", s.SegmentId);
            cmd.Parameters.AddWithValue("$rl", s.RecordLocator);
            cmd.Parameters.AddWithValue("$d", s.DepartureDate.ToString("yyyy-MM-dd"));
            cmd.Parameters.AddWithValue("$p", s.PassengerCount);
            cmd.ExecuteNonQuery();
        }
    }

    public static long InsertSnapshot(string dbPath, decimal price, DateTimeOffset timestamp, string source)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();

        var cmd = con.CreateCommand();
        cmd.CommandText = @"INSERT INTO brent_snapshots(price_usd, captured_at_utc, source) VALUES ($p,$ts,$s); SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("$p", price);
        cmd.Parameters.AddWithValue("$ts", timestamp.UtcDateTime.ToString("O"));
        cmd.Parameters.AddWithValue("$s", source);
        return (long)(cmd.ExecuteScalar() ?? 0L);
    }

    public static BrentSnapshot? GetLatestSnapshot(string dbPath)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT snapshot_id, price_usd, captured_at_utc, source FROM brent_snapshots ORDER BY snapshot_id DESC LIMIT 1";
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new BrentSnapshot(r.GetInt64(0), r.GetDecimal(1), DateTimeOffset.Parse(r.GetString(2)), r.GetString(3));
    }

    public static List<SegmentRow> GetSegmentsForDate(string dbPath, DateTime departureDate)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT segment_id, record_locator, departure_date_utc, passenger_count FROM segments WHERE departure_date_utc = $d";
        cmd.Parameters.AddWithValue("$d", departureDate.ToString("yyyy-MM-dd"));
        return ReadSegments(cmd);
    }

    public static List<SegmentRow> GetAllSegments(string dbPath)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT segment_id, record_locator, departure_date_utc, passenger_count FROM segments ORDER BY departure_date_utc, segment_id";
        return ReadSegments(cmd);
    }

    static List<SegmentRow> ReadSegments(SqliteCommand cmd)
    {
        var list = new List<SegmentRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new SegmentRow(r.GetInt64(0), r.GetString(1), DateTime.Parse(r.GetString(2)), r.GetInt32(3)));
        return list;
    }

    public static bool ExistsAdjustment(string dbPath, long segmentId, DateTime departureDate)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM fuel_adjustments WHERE segment_id = $s AND departure_date_utc = $d LIMIT 1";
        cmd.Parameters.AddWithValue("$s", segmentId);
        cmd.Parameters.AddWithValue("$d", departureDate.ToString("yyyy-MM-dd"));
        return cmd.ExecuteScalar() is not null;
    }

    public static void InsertAdjustment(string dbPath, FuelAdjustmentRow row)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO fuel_adjustments(segment_id, record_locator, departure_date_utc, passenger_count, snapshot_id, brent_price_usd, brent_captured_at_utc, brent_source, band_label, band_range, euro_per_pax, total_adjustment, action_type, execution_status, reason)
            VALUES ($sid,$rl,$d,$p,$snap,$bp,$bts,$bs,$bl,$br,$epp,$tot,$act,$st,$rsn)";
        cmd.Parameters.AddWithValue("$sid", row.SegmentId);
        cmd.Parameters.AddWithValue("$rl", row.RecordLocator);
        cmd.Parameters.AddWithValue("$d", row.DepartureDate.ToString("yyyy-MM-dd"));
        cmd.Parameters.AddWithValue("$p", row.PassengerCount);
        cmd.Parameters.AddWithValue("$snap", row.SnapshotId);
        cmd.Parameters.AddWithValue("$bp", row.BrentPriceUsd);
        cmd.Parameters.AddWithValue("$bts", row.BrentCapturedAtUtc.UtcDateTime.ToString("O"));
        cmd.Parameters.AddWithValue("$bs", row.BrentSource);
        cmd.Parameters.AddWithValue("$bl", row.BandLabel);
        cmd.Parameters.AddWithValue("$br", row.BandRange);
        cmd.Parameters.AddWithValue("$epp", row.EuroPerPax);
        cmd.Parameters.AddWithValue("$tot", row.TotalAdjustment);
        cmd.Parameters.AddWithValue("$act", row.ActionType);
        cmd.Parameters.AddWithValue("$st", row.ExecutionStatus);
        cmd.Parameters.AddWithValue("$rsn", row.Reason);
        cmd.ExecuteNonQuery();
    }

    public static List<FuelAdjustmentRow> GetAdjustments(string dbPath)
    {
        using var con = new SqliteConnection($"Data Source={dbPath}");
        con.Open();
        var cmd = con.CreateCommand();
        cmd.CommandText = @"SELECT id, segment_id, record_locator, departure_date_utc, passenger_count, snapshot_id, brent_price_usd, brent_captured_at_utc, brent_source, band_label, band_range, euro_per_pax, total_adjustment, action_type, execution_status, reason FROM fuel_adjustments ORDER BY id DESC";
        var list = new List<FuelAdjustmentRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new FuelAdjustmentRow(
                r.GetInt64(0), r.GetInt64(1), r.GetString(2), DateTime.Parse(r.GetString(3)), r.GetInt32(4), r.GetInt64(5),
                r.GetDecimal(6), DateTimeOffset.Parse(r.GetString(7)), r.GetString(8), r.GetString(9), r.GetString(10),
                r.GetDecimal(11), r.GetDecimal(12), r.GetString(13), r.GetString(14), r.GetString(15)
            ));
        }
        return list;
    }
}
