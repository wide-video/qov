import { QOVDecoder, QOV_IS_I_FRAME } from "./QOV";

export class QOVPlayer {
	readonly element = document.createElement("div");
	readonly canvas = document.createElement("canvas");
	readonly context:CanvasRenderingContext2D;
	loop = false;

	private _src:string | Blob | undefined;
	private _decoder:QOVDecoder | undefined;
	private _playWhenReady = true;
	private renderFrameId:number | undefined;
	private lock:any;

	constructor() {
		const {canvas, element} = this;
		element.classList.add("QOVPlayer");
		element.append(canvas);
		element.onclick = () => this.restart();
		this.context = this.canvas.getContext("2d")!;
	}

	get src():string | Blob | undefined {
		return this._src;
	}

	set src(value:string | Blob | undefined) {
		if(this.src === value)
			return;
		this._src = value;
		if(typeof value === "string")
			fetch(value)
				.then(response => response.blob()
				.then(blob => QOVDecoder.init(blob)
				.then(decoder => this.decoder = decoder)));
		else if(value)
			QOVDecoder.init(value).then(decoder => this.decoder = decoder);
		else
			this.decoder = undefined;
	}

	get playWhenReady():boolean {
		return this._playWhenReady;
	}

	set playWhenReady(value:boolean) {
		this._playWhenReady = value;
		if(value)
			this.renderFrame();
	}

	get decoder():QOVDecoder | undefined {
		return this._decoder;
	}

	protected set decoder(value:QOVDecoder | undefined) {
		this._decoder = value;
		if(value) {
			this.canvas.width = value.header.video.width;
			this.canvas.height = value.header.video.height;
		}
		this.renderFrame();
	}

	restart() {
		this.decoder?.restart();
		this.renderFrame();
	}

	protected async renderFrame():Promise<RenderFrameStats | undefined> {
		const {canvas, context, decoder, loop, playWhenReady} = this;
		if(!decoder) {
			context.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}

		const t0 = performance.now();
		const {video:{frameRate, height, width}} = decoder.header;
		if(decoder.frameAvailable) {
			const lock = this.lock = {};
			const frame = await decoder.getNextFrame();
			// click/restart() may cause race condition with await on previous line
			if(lock !== this.lock)
				return;

			const iframe = QOV_IS_I_FRAME(frame);
			const t1 = performance.now();
			const decoded = decoder.readFrame(frame);
			const t2 = performance.now();
			const data = new ImageData(new Uint8ClampedArray(decoded), width, height);
			context.clearRect(0, 0, width, height);
			context.putImageData(data, 0, 0);
			clearTimeout(this.renderFrameId);
			this.renderFrameId = undefined;
			if(playWhenReady) {
				const delay = Math.max(1000 / frameRate - performance.now() + t0, 0);
				this.renderFrameId = setTimeout(() => this.renderFrame(), delay);
			}
			return {decodingDuration:t2 - t1, iframe};
		}
		if(loop)
			this.restart();
		return;
	}
}

type RenderFrameStats = {
	readonly decodingDuration:number;
	readonly iframe:boolean;
}