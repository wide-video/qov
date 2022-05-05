import * as Dev from "./Dev";
import * as QOI from "./QOI";

const assetBase = "../static/qoi_test_images"
const logElement = document.createElement("pre");
const canvas = document.createElement("canvas");
document.body.append(logElement);

const testImages:{
	readonly name:string;
	readonly channels:3 | 4;
}[] = [
	{name:"dice", channels:4},
	{name:"kodim10", channels:3},
	{name:"kodim23", channels:3},
	{name:"qoi_logo", channels:4},
	{name:"testcard", channels:4},
	{name:"testcard_rgba", channels:4},
	{name:"wikipedia_008", channels:3},
];

const log = (message:string) => Dev.log(`${(performance.now()|0).toString().padStart(4, " ")}: ${message}`, logElement);

const assert = <T>(label:string, expected:T, result:T) => {
	const message = expected === result ? "OK" : `FAIL ${expected} != ${result}`
	log(`TEST ${label} ${message}`);
}

const perf = async (label:string, count:number, executor:()=>any) => {
	const durations = [];
	for(let i = 0; i < count; i++) {
		const t0 = performance.now();
		executor();
		const t1 = performance.now();
		const duration = t1-t0;
		durations.push(duration);
		log(`PERF ${label} #${(i+1).toString().padStart(3, "0")} took ${duration|0}ms`);
		await new Promise(requestAnimationFrame);
	}
	log(`<b>PERF ${label} took ${durations.reduce((a,b) => a + b, 0) / durations.length|0}ms in average</b>`)
}

const runQOITestImages = async () => {
	for(const {name, channels} of testImages) {
		await Dev.fetchToCanvas(`${assetBase}/${name}.png`, canvas);
		const source = `${assetBase}/${name}.${channels === 4 ? "rgba" : "rgb"}`;
		const expected = await (await fetch(`${assetBase}/${name}.qoi`)).arrayBuffer();
		const rgba = await (await fetch(source)).arrayBuffer();
		const encoded = QOI.encode({width:canvas.width, height:canvas.height, channels, colorspace:0, data:rgba});

		assert(`QOI.encode ${source}`,
			await Dev.sha256Bytes(expected),
			await Dev.sha256Bytes(encoded));

		const decoded = QOI.decode(encoded);
		assert(`QOI.decode ${source}`,
			await Dev.sha256Bytes(rgba),
			await Dev.sha256Bytes(decoded.data));
	}
}

const runTestAssets = async () => {
	const source = `${assetBase}/wikipedia_008.png`;
	await Dev.fetchToCanvas(source, canvas);
	const rgba = Dev.readRGBA(canvas.getContext("2d")!);

	Dev.log("<hr>", logElement);

	const encoded = QOI.encode({width:canvas.width, height:canvas.height, channels:4, colorspace:0, data:rgba});
	assert(`QOI.encode ${source}`,
		"066636f93c49f5e2938848bad645971e771c7d5c55c3e13d594ced77667ce220",
		await Dev.sha256Bytes(encoded));

	const decoded = QOI.decode(encoded);
	assert(`QOI.decode ${source}`,
		await Dev.sha256Bytes(rgba),
		await Dev.sha256Bytes(decoded.data));

	Dev.log("<hr>", logElement);
	await perf(`QOI.encode ${source}`, 20, () => QOI.encode({width:canvas.width, height:canvas.height, channels:4, colorspace:0, data:rgba}));

	Dev.log("<hr>", logElement);
	await perf(`QOI.decode ${source}`, 20, () => QOI.decode(encoded));
}

const run = async () => {
	await runQOITestImages();
	await runTestAssets();
}

run();