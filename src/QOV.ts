import { QOI_COLOR_HASH, QOI_RGBA, QOI_SIGNED8, QOI_UNSIGNED8 } from "./QOI";

export const QOV_MAGIC = 0x716f7631; // [...new TextEncoder().encode("qov1")].map(item => item.toString(16)).join("")
const QOV_HEADER_POSITION_FRAME_OFFSET = 25;
const QOV_FRAME_HEADER_SIZE = 1;
const QOV_I_FRAME = 0; // intra-coded
const QOV_P_FRAME = 1; // predictive

export const QOV_IS_I_FRAME = (frame:ArrayBuffer) => 
	new Uint8Array(frame)[0] === QOV_I_FRAME;

export class QOVEncoder {
	readonly config:QOVVideoConfig;
	readonly frames:Blob[] = [];

	private previous?:ArrayBuffer;
	private readonly index = new Uint32Array(64);

	constructor(config:QOVVideoConfig) {
		this.config = config;
	}

	writeFrame(data:ArrayBuffer, iframe?:boolean):ArrayBuffer {
		const {frames, index, previous} = this;
		let result:ArrayBuffer;
		if(iframe || !previous) {
			index.fill(0);
			result = this.encode(data);
		} else {
			result = this.encode(data, new Uint8Array(previous));
		}
		frames.push(new Blob([result]));
		this.previous = data;
		return result;
	}

	flush():Blob {
		const {frames, config:{channels, frameRate, height, width}} = this;
		const headerSize = QOV_HEADER_POSITION_FRAME_OFFSET + frames.length * 4;
		const header = new DataView(new ArrayBuffer(headerSize));
		header.setUint32(0, QOV_MAGIC);
		header.setUint32(4, headerSize);
		header.setUint32(8, width);
		header.setUint32(12, height);
		header.setFloat32(16, frameRate);
		header.setUint8(20, channels);
		header.setUint32(21, frames.length);

		let frameOffset = headerSize;
		for(let i = 0; i < frames.length; i++) {
			header.setUint32(QOV_HEADER_POSITION_FRAME_OFFSET + i * 4, frameOffset);
			frameOffset += frames[i]!.size;
		}

		return new Blob([header, ...frames]);
	}

	private encode(source:ArrayBuffer, previous?:Uint8Array):ArrayBuffer {
		const {config:{channels, height, width}, index} = this;
		const max_size = width * height * (channels + 1) + QOV_FRAME_HEADER_SIZE;
		const bytes = new Uint8Array(max_size);
		const pixels = new Uint8Array(source);

		bytes[0] = previous ? QOV_P_FRAME : QOV_I_FRAME;

		let p = QOV_FRAME_HEADER_SIZE;
		let run = 0;
		let px_prev_r = 0;
		let px_prev_g = 0;
		let px_prev_b = 0;
		let px_prev_a = 255;
		let px_prev = px_prev_a;
		let px_a = px_prev_a;

		const px_len = width * height * channels;
		const px_end = px_len - channels;
		for(let px_pos = 0; px_pos < px_len; px_pos += channels) {
			const px_r = pixels[px_pos]!;
			const px_g = pixels[px_pos + 1]!;
			const px_b = pixels[px_pos + 2]!;
			if(channels === 4)
				px_a = pixels[px_pos + 3]!;
			
			const px = QOI_RGBA(px_r, px_g, px_b, px_a);

			if(previous) {
				px_prev_r = previous[px_pos]!;
				px_prev_g = previous[px_pos + 1]!;
				px_prev_b = previous[px_pos + 2]!;
				px_prev_a = previous[px_pos + 3]!;
				px_prev = QOI_RGBA(px_prev_r, px_prev_g, px_prev_b, px_prev_a);
			}
	
			if(px === px_prev) {
				run++;
				if(run === 62 || px_pos === px_end) {
					bytes[p++] = 0b11000000 | (run - 1);
					run = 0;
				}
			} else {
				if(run > 0) {
					bytes[p++] = 0b11000000 | (run - 1);
					run = 0;
				}
				
				const index_pos = QOI_COLOR_HASH(px_r, px_g, px_b, px_a);
				if(index[index_pos] === px) {
					bytes[p++] = index_pos; // QOI_OP_INDEX 0x00
				} else {
					index[index_pos] = px;
	
					if (px_a === px_prev_a) {
						const vr = QOI_SIGNED8(px_r - px_prev_r);
						const vg = QOI_SIGNED8(px_g - px_prev_g);
						const vb = QOI_SIGNED8(px_b - px_prev_b);
						const vg_r = vr - vg;
						const vg_b = vb - vg;
	
						if(vr > -3 && vr < 2 && vg > -3 && vg < 2 && vb > -3 && vb < 2) {
							bytes[p++] = 0b01000000 | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2); // QOI_OP_DIFF
						} else if(vg_r > -9 && vg_r <  8 && vg > -33 && vg < 32 && vg_b > -9 && vg_b < 8) {
							bytes[p++] = 0b10000000 | (vg + 32); // QOI_OP_LUMA
							bytes[p++] = (vg_r + 8) << 4 | (vg_b +  8);
						} else {
							bytes[p++] = 0b11111110; // QOI_OP_RGB
							bytes[p++] = px_r;
							bytes[p++] = px_g;
							bytes[p++] = px_b;
						}
					} else {
						bytes[p++] = 0b11111111; // QOI_OP_RGBA
						bytes[p++] = px_r;
						bytes[p++] = px_g;
						bytes[p++] = px_b;
						bytes[p++] = px_a;
					}
				}
			}

			if(!previous) {
				px_prev_r = px_r;
				px_prev_g = px_g;
				px_prev_b = px_b;
				px_prev_a = px_a;
				px_prev = px;
			}
		}

		return bytes.slice(0, p).buffer;
	}
}

export class QOVDecoder {
	readonly source:Blob;
	readonly header:QOVHeader;

	private readonly index = new Uint32Array(64);
	private nextFrame = 0;
	private previous?:ArrayBuffer;

	private constructor(source:Blob, header:QOVHeader) {
		this.source = source;
		this.header = header;
	}

	static async init(source:Blob):Promise<QOVDecoder> {
		return new this(source, await this.parseHeader(source));
	}

	get framesRead() {
		return this.nextFrame;
	}

	get frameAvailable():boolean {
		return this.nextFrame < this.header.frames;
	}

	static async parseHeader(source:Blob):Promise<QOVHeader> {
		const init = await source.slice(0, 8).arrayBuffer();
		const size = new Uint32Array(init)[4]!;
		const view = new DataView(await source.slice(0, size).arrayBuffer());
		const width = view.getUint32(8);
		const height = view.getUint32(12);
		const frameRate = view.getFloat32(16);
		const channels = view.getUint8(20);
		const frames = view.getUint32(21);
		
		const framePositions = []
		for(let i = 0; i < frames; i++)
			framePositions.push(view.getUint32(QOV_HEADER_POSITION_FRAME_OFFSET + i * 4));
		return {size, video:{width, height, channels, frameRate}, frames, framePositions};
	}

	restart() {
		this.index.fill(0);
		this.nextFrame = 0;
		delete this.previous;
	}

	async getNextFrame():Promise<ArrayBuffer> {
		const {header:{framePositions}, nextFrame, source} = this;
		const start = framePositions[nextFrame]!;
		const end = framePositions[nextFrame + 1];
		return await source.slice(start, end).arrayBuffer();
	}

	readFrame(frame:ArrayBuffer):ArrayBuffer {
		const {header, index, previous} = this;
		const bytes = new Uint8Array(frame);
		let result:ArrayBuffer;
		if(QOV_IS_I_FRAME(frame)) {
			index.fill(0);
			result = this.decode(header, bytes);
		} else if(previous) {
			result = this.decode(header, bytes, new Uint8Array(previous));
		} else {
			throw "Unexpected frame";
		}
		this.nextFrame++;
		this.previous = result;
		return result;
	}

	private decode(header:QOVHeader, source:ArrayBuffer, previous?:Uint8Array):ArrayBuffer {
		const {channels, height, width} = header.video;
		const bytes = new Uint8Array(source);
		const px_len = width * height * channels;
		const pixels = new Uint8Array(px_len);
		const index = this.index;

		let px_r = 0;
		let px_g = 0;
		let px_b = 0;
		let px_a = 255;
		let run = 0;
		let p = QOV_FRAME_HEADER_SIZE;

		for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
			if(previous) {
				px_r = previous[px_pos]!;
				px_g = previous[px_pos + 1]!;
				px_b = previous[px_pos + 2]!;
				px_a = previous[px_pos + 3]!;
			}

			if (run > 0) {
				run--;
			} else {
				const b1 = bytes[p++]!;
				if (b1 === 0b11111110) { // QOI_OP_RGB
					px_r = bytes[p++]!;
					px_g = bytes[p++]!;
					px_b = bytes[p++]!;
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
				} else if (b1 === 0b11111111) { // QOI_OP_RGBA
					px_r = bytes[p++]!;
					px_g = bytes[p++]!;
					px_b = bytes[p++]!;
					px_a = bytes[p++]!;
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
				} else {
					const op = b1 & 0b11000000;
					if (op === 0b00000000) { // QOI_OP_INDEX
						const px = index[b1]!;
						px_r = px >> 24;
						px_g = px >> 16 & 0xff;
						px_b = px >> 8 & 0xff;
						px_a = px & 0xff;
						index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = px;
					} else if (op === 0b01000000) { // // QOI_OP_DIFF
						px_r = QOI_UNSIGNED8(px_r + ((b1 >> 4) & 0x03) - 2);
						px_g = QOI_UNSIGNED8(px_g + ((b1 >> 2) & 0x03) - 2);
						px_b = QOI_UNSIGNED8(px_b + (b1 & 0x03) - 2);
						index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
					} else if (op === 0b10000000) { // QOI_OP_LUMA
						const b2 = bytes[p++]!;
						const vg = (b1 & 0x3f) - 32;
						px_r = QOI_UNSIGNED8(px_r + vg - 8 + ((b2 >> 4) & 0x0f));
						px_g = QOI_UNSIGNED8(px_g + vg);
						px_b = QOI_UNSIGNED8(px_b + vg - 8 +  (b2 & 0x0f));
						index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
					} else if (op === 0b11000000) { // QOI_OP_RUN
						run = b1 & 0x3f;
					}
				}
			}
	
			pixels[px_pos] = px_r;
			pixels[px_pos + 1] = px_g;
			pixels[px_pos + 2] = px_b;
			if (channels === 4)
				pixels[px_pos + 3] = px_a;
		}

		return pixels.buffer;
	}
}

type QOVVideoConfig = {
	readonly width:number;
	readonly height:number;
	readonly channels:number;
	readonly frameRate:number;
}

type QOVHeader = {
	readonly size:number;
	readonly video:QOVVideoConfig;
	readonly frames:number;
	readonly framePositions:ReadonlyArray<number>;
}