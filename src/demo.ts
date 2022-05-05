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
		const {decoder, element} = this;
		if(result) {
			const duration = result.decodingDuration;
			this.decodingDuration += duration;
			if(decoder)
				element.dataset["message"] = `${result.iframe ? "I" : "P"}-Frame #${decoder.framesRead} decoded in ${duration|0}ms`;
		} else if(decoder) {
			delete element.dataset["message"];
			const frames = decoder.header.frames;
			const duration = this.decodingDuration;
			log(`<b>QOV decoded ${frames} frames in ${duration|0}ms. Decoding speed is ${frames/duration*1000|0} fps</b>`);
			this.decodingDuration = 0;
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

const runVideo = async () => {
	const assetUrl = "/asset/bbb_h264_1280x720_25fps_aac_51_30s_5MB.mp4";
	const frameRate = 25;
	const maxFrames = 125;
	const assetFilename = assetUrl.split("/").pop();
	let encoder:QOVEncoder | undefined;
	let duration = 0;
	await Dev.readFrames(assetUrl, canvas, maxFrames, 
		(frame, width, height, progress) => {
			if(!encoder)
				encoder = new QOVEncoder({width, height, channels:4, frameRate});
			const position = encoder.frames.length;
			const t0 = performance.now();
			const qovFrame = encoder.writeFrame(frame, !(position % 20));
			const t1 = performance.now();
			duration += t1-t0;
			const iframe = QOV_IS_I_FRAME(qovFrame);
			log(`${iframe ? "I" : "P"}-Frame #${position} (${progress * 100|0}%) encoded to ${qovFrame.byteLength/1024|0}kB as in ${t1-t0|0}ms`);
		});
	if(!encoder)
		return;

	const {config:{width, height}, frames} = encoder;
	log(`<b>Encoded ${frames.length} frames from video ${width}x${height}@${frameRate} in ${duration|0}ms. Encoding speed is ${frames.length/duration*1000|0} fps</b>`);

	const encoded = encoder.flush();
	const qovFilename = `${assetFilename}.qov`;
	const button = document.createElement("button");
	button.textContent = `Save ${qovFilename} ${encoded.size/1024|0} KB`;
	button.onclick = () => Dev.saveFile(new File([encoded], qovFilename));
	Dev.log(button, logElement);

	log(`<b>QOV encoded to ${encoded.size/1024|0}kB in ${duration|0}ms</b>`);
	player.src = encoded;
	player.playWhenReady = true;
	player.loop = true;
}

const run = async () => {
	runVideo();
}

run();