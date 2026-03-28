const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = __dirname;
process.chdir(dir);
try {
  const out = execSync("git show HEAD:lib/image/whiteToAlpha.js", { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(path.join(dir, "lib/image/whiteToAlpha.js"), out, "utf8");
  fs.writeFileSync(path.join(dir, "_recover_ok.txt"), String(out.length), "utf8");
} catch (e) {
  fs.writeFileSync(path.join(dir, "_recover_err.txt"), String(e), "utf8");
  process.exit(1);
}
