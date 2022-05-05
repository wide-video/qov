import * as Dev from "./Dev";
import { QOVDecoder, QOVEncoder, QOV_IS_I_FRAME } from "./QOV";
import { QOVPlayer } from "./QOVPlayer";

class Player extends QOVPlayer {
	private decodingDuration = 0;

	override get decoder():QOVDecoder | undefined {
		return super.decoder;
	}

	override set decoder(value:QOVDecoder | undefined) {
		super.decoder = value;
		if(value)
			log(`QOV decoded ${value.header.frames} frames from header`);
	}

	protected override async renderFrame() {
		const result = await super.renderFrame();
		const decoder = this.decoder;
		if(result) {
			const duration = result.decodingDuration;
			this.decodingDuration += duration;
			if(decoder)
				log(`${result.iframe ? "I" : "P"}-Frame #${decoder.framesRead} decoded in ${duration|0}ms`);
		} else if(decoder) {
			const frames = decoder.header.frames;
			const duration = this.decodingDuration;
			log(`<b>QOV decoded ${frames} frames in ${duration|0}ms. Decoding speed is ${frames/duration*1000|0} fps</b>`);
		}
		return result;
	}
}

const canvas = document.createElement("canvas");
canvas.classList.add("source");
const player = new Player();
const logElement = document.createElement("pre");
logElement.classList.add("log");

const log = (message:string) => Dev.log(`${(performance.now()|0).toString().padStart(4, " ")}: ${message}`, logElement);

document.body.append(canvas, player.element, logElement);

/*
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
*/

const runVideo = async () => {
	const progressElement = document.createElement("p");
	const assetUrl = Dev.assetVideo;
	const assetFilename = assetUrl.split("/").pop();
	logElement.append(progressElement);
	const {frames, width, height, frameRate} = await Dev.fetchFrames(assetUrl, canvas, NaN, (frame, progress) => 
		progressElement.textContent = `reading frame #${frame} ${progress * 100|0}%`);
	progressElement.remove();
	
	log(`Resolved ${frames.length} frames from video ${width}x${height}@${frameRate}`);

	const encoder = new QOVEncoder({width, height, channels:4, frameRate});
	let duration = 0;
	for(let i = 0; i < frames.length; i++) {
		const frame = frames[i]!;
		const data = await frame.arrayBuffer();
		const t0 = performance.now();
		const qovFrame = encoder.writeFrame(data, !(i % 20));
		const t1 = performance.now();
		duration += t1-t0;
		const iframe = QOV_IS_I_FRAME(qovFrame);
		log(`${iframe ? "I" : "P"}-Frame #${i+1} encoded to ${qovFrame.byteLength/1024|0}kB as in ${t1-t0|0}ms`);
	}
	const encoded = encoder.flush();

	const qovFilename = `${assetFilename}.qov`;
	const button = document.createElement("button");
	button.textContent = `Save ${qovFilename}`;
	button.onclick = () => Dev.saveFile(new File([encoded], qovFilename));
	Dev.log(button, logElement);

	log(`<b>QOV encoded to ${encoded.size/1024|0}kB in ${duration|0}ms</b>`);
	player.src = encoded;
	player.playWhenReady = true;
}

const run = async () => {
	runVideo();
}

run();