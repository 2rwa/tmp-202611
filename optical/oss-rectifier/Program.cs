using DiscImageStudio.Core.Calibration;
using System.Text.Json;
if(args.Length!=2) throw new ArgumentException("Usage: INPUT.json OUTPUT.json");
using var doc=JsonDocument.Parse(File.ReadAllText(args[0]));
static CalibrationPoint[] P(JsonElement a)=>a.EnumerateArray().Select(v=>new CalibrationPoint(v[0].GetDouble(),v[1].GetDouble())).ToArray();
var output=new Dictionary<string,object>();
foreach(var d in doc.RootElement.GetProperty("discs").EnumerateObject()){
    var b=d.Value;
    var fit=CalibrationPhotoRectifier.Fit(P(b.GetProperty("outer")),P(b.GetProperty("hole")),60,7.5);
    Console.WriteLine($"{d.Name} success={fit.Succeeded} outerRms={fit.OuterRmsPixels:G6} holeRms={fit.HoleRmsPixels:G6} {fit.Message}");
    if(!fit.Succeeded||fit.Transform is null)throw new InvalidOperationException($"Upstream rectifier rejected {d.Name}: {fit.Message}");
    var side=new Dictionary<string,double[][]>();
    foreach(var s in b.GetProperty("boundaries").EnumerateObject())
       side[s.Name]=P(s.Value).Select(fit.Transform.SourceToDisc).Select(q=>new[]{q.X,q.Y}).ToArray();
    output[d.Name]=new{outerRmsPx=fit.OuterRmsPixels,holeRmsPx=fit.HoleRmsPixels,boundaryMm=side,homographyDiscToSource=fit.Transform.DiscToSourceMatrix9};
}
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[1]))!);
File.WriteAllText(args[1],JsonSerializer.Serialize(output,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine("DISCIMAGESTUDIO_OSS_RECTIFIER_COMPLETED");
