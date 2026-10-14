import argparse, functools, http.server, json, os, subprocess, threading, time, struct, zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("variant")
parser.add_argument("--runs", type=int, default=3)
parser.add_argument("--seed", action="store_true")
parser.add_argument("--validate-modals", action="store_true")
parser.add_argument("--validate-screenshots", action="store_true")
parser.add_argument("--output", type=Path, default=REPO/".simplemc-performance")
parser.add_argument("--binary", type=Path, default=REPO/"target/debug/SimpleMC.exe")
args = parser.parse_args()
ROOT = args.output.resolve()
EXE = args.binary.resolve()
if not EXE.is_relative_to((REPO/"target").resolve()):
	raise ValueError("Use a benchmark binary built in this repository's target folder")
DIST = REPO / "apps/app-frontend/dist"
RESULTS = ROOT / "results"
RESULTS.mkdir(parents=True, exist_ok=True)
config = {}
finished = threading.Event()

class Handler(http.server.SimpleHTTPRequestHandler):
	def log_message(self, *args):
		if "__perf__" in str(args): print(args, flush=True)
	def do_GET(self):
		if self.path == "/__perf__/config":
			data = json.dumps(config).encode()
			self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(data)
		else:
			if not (DIST / self.path.split("?",1)[0].lstrip("/")).is_file(): self.path = "/index.html"
			return super().do_GET()
	def do_POST(self):
		if self.path == "/__perf__/error":
			error = self.rfile.read(int(self.headers["Content-Length"])).decode()
			print("Frontend error: "+error, flush=True)
			(RESULTS/(config["variant"]+"-errors.log")).open("a",encoding="utf-8").write(error+"\n")
			self.send_response(200);self.end_headers();return
		assert self.path == "/__perf__/report"
		report = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
		report["wallToReportMs"] = (time.perf_counter() - config["launchClock"]) * 1000
		report["startupWallMs"] = report["wallToReportMs"] - (report.get("navigationReportMs", report["wallToReportMs"]) - report.get("startupMs", 0))
		(RESULTS / (config["variant"] + "-" + str(config["run"]) + ".json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
		self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
		print(json.dumps({"run": config["run"], "startupMs": report.get("startupMs"), "error": report.get("error"), "routes": len(report["routes"])}), flush=True)
		finished.set()

server = http.server.ThreadingHTTPServer(("127.0.0.1",1420),functools.partial(Handler,directory=str(DIST)))
threading.Thread(target=server.serve_forever,daemon=True).start()
env = dict(os.environ)
env["THESEUS_CONFIG_DIR"] = str(ROOT / "performance-data")
env["WEBVIEW2_USER_DATA_FOLDER"] = str(ROOT / "performance-webview")
env["MODRINTH_EXTERNAL_UPDATE_PROVIDER"] = "benchmark"
env["RUST_LOG"] = "info"
env["pnpm_config_verify_deps_before_run"] = "false"
try:
	for index in range(0 if args.seed else 1,args.runs+1):
		finished.clear()
		if index == 1 and args.seed:
			folder = (ROOT/"performance-data/profiles/Benchmark Minecraft 000/screenshots").resolve()
			assert folder.is_relative_to((ROOT/"performance-data").resolve())
			folder.mkdir(parents=True, exist_ok=True)
			def chunk(kind, data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
			rows = b''.join(b'\0'+bytes((y*73%256,y*13%256,y*37%256))*1280 for y in range(720))
			png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1280,720,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
			for image in range(600):
				file = folder/f'2024-01-{image//24+1:02d}_{image%24:02d}.00.00.png'
				if not file.exists():
					file.write_bytes(png);os.utime(file,(1704067200+image*86400,1704067200+image*86400))
		config = {"variant": args.variant, "run": index, "seed": args.seed and index == 0, "validateModals": args.validate_modals, "validateScreenshots": args.validate_screenshots, "launchClock": time.perf_counter()}
		with (RESULTS/(args.variant+"-"+str(index)+".log")).open("w",encoding="utf-8") as log:
			process = subprocess.Popen([str(EXE)],cwd=str(EXE.parent),env=env,stdout=log,stderr=subprocess.STDOUT)
			try:
				if not finished.wait(120):
					print("Timed out: "+str(index),flush=True)
					break
			finally:
				try: process.wait(timeout=3)
				except subprocess.TimeoutExpired: process.terminate(); process.wait(timeout=5)
finally:
	server.shutdown()
