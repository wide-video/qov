import * as lib from "./lib";
import { QOVDecoder, QOVEncoder, QOV_IS_I_FRAME } from "./QOV";
import { QOVPlayer } from "./QOVPlayer";

const frameRate = 25;
const maxFrames = 125;

function log(message:string) {
	lib.log(`${(performance.now()|0).toString().padStart(4, " ")}: ${message}`, logElement);
}

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

function play(source:File, encoder:QOVEncoder, duration:number) {
	const {config:{width, height}, frames} = encoder;
	log(`<b>Encoded ${frames.length} frames from video ${width}x${height}@${frameRate} in ${duration|0}ms. Encoding speed is ${frames.length/duration*1000|0} fps</b>`);

	const encoded = encoder.flush();
	const qovFilename = `${source.name}.qov`;
	const button = document.createElement("button");
	button.textContent = `Save ${qovFilename} ${encoded.size/1024|0} KB`;
	button.onclick = () => lib.saveFile(new File([encoded], qovFilename));
	lib.log(button, logElement);

	log(`<b>QOV encoded to ${encoded.size/1024|0}kB in ${duration|0}ms</b>`);
	player.src = encoded;
	player.playWhenReady = true;
	player.loop = true;
}

async function runGIF(source:File) {
	// @ts-ignore
	const gif = GIF();
	
	gif.onload = () => {
		console.log(gif);
		console.log(gif.frames);
		const {width, height} = gif;
		let duration = 0;
		const encoder = new QOVEncoder({width, height, channels:4, frameRate});
		for(let i = 0; i < gif.frames.length; i++) {
			const frame = lib.readRGBA(gif.frames[i].image.ctx);
			const t0 = performance.now();
			const qovFrame = encoder.writeFrame(frame, !(i % 20));
			const t1 = performance.now();
			duration += t1-t0;
			const iframe = QOV_IS_I_FRAME(qovFrame);
			log(`${iframe ? "I" : "P"}-Frame #${i} encoded to ${qovFrame.byteLength/1024|0}kB as in ${t1-t0|0}ms`);
		}
		play(source, encoder, duration);
	}
	gif.load(await source.arrayBuffer());
}

async function runVideo(source:File) {
	let encoder:QOVEncoder | undefined;
	let duration = 0;
	await lib.readFrames(source, canvas, maxFrames, 
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
	play(source, encoder, duration);
}

const onSourceDrop = (event:DragEvent) => {
	event.preventDefault();
	if(!event.dataTransfer?.files.length)
		return;

	const file = event.dataTransfer.files[0]!;
	
	if(file.name.endsWith(".gif")) {
		const image = new Image();
		image.src = URL.createObjectURL(file);
		source.append(image);
		runGIF(file)
	} else {
		source.append(canvas);
		runVideo(file);
	}
}

const canvas = document.createElement("canvas");
const source = document.createElement("div");
source.classList.add("source");
source.ondrop = onSourceDrop;
source.ondragover = event => event.preventDefault();
const player = new Player();
const logElement = document.createElement("pre");
logElement.classList.add("log");

document.body.append(source, player.element, logElement);