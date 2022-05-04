import * as Dev from "./Dev";
import * as QOI from "./QOI";
import { QOVDecoder, QOVEncoder } from "./QOV";

const canvas = document.createElement("canvas");
document.body.append(canvas);

const canvas2 = document.createElement("canvas");
document.body.append(canvas2);

const logElement = document.createElement("pre");
document.body.append(logElement);

const log = (message:string) => Dev.log(`${(performance.now()|0).toString().padStart(4, " ")}: ${message}`, logElement);

const runImage = async () => {
	await Dev.fetchToCanvas(Dev.assetImage, canvas);
	const rgba = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.buffer;

	const t0 = performance.now();
	const qoi = QOI.encode({width:canvas.width, height:canvas.height, channels:4, colorspace:0, data:rgba});
	const t1 = performance.now();
	const rgba_decoded = QOI.decode(qoi);
	const t2 = performance.now();
	
	Dev.log(`encode toook ${t1-t0|0}ms`, logElement);
	Dev.log(`decode toook ${t2-t1|0}ms`, logElement);
	Dev.log(`rgba ${rgba.byteLength/1024|0}kB`, logElement);
	Dev.log(`qoi ${qoi.byteLength/1024|0}kB`, logElement);

	canvas2.width = rgba_decoded.width;
	canvas2.height = rgba_decoded.height;
	const ctx2 = canvas2.getContext("2d")!;
	ctx2.putImageData(new ImageData(new Uint8ClampedArray(rgba_decoded.data), canvas2.width, canvas2.height), 0, 0);
}

const runVideo = async () => {
	const progressElement = document.createElement("p");
	logElement.append(progressElement);
	const {frames, width, height, frameRate} = await Dev.fetchFrames(Dev.assetVideo, canvas, 100, (frame, progress) => 
		progressElement.textContent = `reading frame #${frame} ${progress * 100|0}%`);
	progressElement.remove();
	
	log(`Resolved ${frames.length} frames from video ${width}x${height}@${frameRate}`);

	const encoder = new QOVEncoder({width, height, channels:4, frameRate});
	let duration = 0;
	for(let i = 0; i < frames.length; i++) {
		const frame = frames[i]!;
		const data = await frame.arrayBuffer();
		const t0 = performance.now();
		const qovFrame = encoder.writeFrame(data, false);
		const t1 = performance.now();
		duration += t1-t0;
		log(`Frame #${i+1} encoded to ${qovFrame.byteLength/1024|0}kB in ${t1-t0|0}ms`);
	}
	const encoded = encoder.flush();
	log(`QOV encoded to ${encoded.size/1024|0}kB in ${duration|0}ms`);

	const decoder = new QOVDecoder(encoded);
	const header = await decoder.readHeader();
	canvas2.width = header.video.width;
	canvas2.height = header.video.height;
	const ctx = canvas2.getContext("2d")!;
	log(`QOV decoded ${header.frames} frames from header`);

	for(let i = 0; i < header.frames; i++) {
		const t0 = performance.now();
		const decoded = await decoder.readFrame();
		const t1 = performance.now();
		log(`Frame #${i+1} decoded in ${t1-t0|0}ms`);
		ctx.clearRect(0, 0, canvas2.width, canvas2.height);
		ctx.putImageData(new ImageData(new Uint8ClampedArray(decoded), canvas2.width, canvas2.height), 0, 0);
		await new Promise(resolve => setTimeout(resolve, 1000 / header.video.frameRate - performance.now() + t0));
	}
}

const run = async () => {
	runImage;
	runVideo();
}

run();