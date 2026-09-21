using System;
using System.IO;
class Program {
    static void Main() {
        var tempPath = Path.GetTempPath();
        Console.WriteLine("Temp path is: " + tempPath);
        Directory.CreateDirectory(tempPath);
        Console.WriteLine("Created? " + Directory.Exists(tempPath));
    }
}
