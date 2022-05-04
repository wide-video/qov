import * as QOI from "./QOI";

export const QOV_MAGIC = 0x716f7631; // [...new TextEncoder().encode("qov1")].map(item => item.toString(16)).join("")
export const QOV_HEADER_POSITION_FRAME_OFFSET = 25;
export const QOV_FRAME_HEADER_SIZE = 1;
export const QOV_P_FRAME = 1;
export const QOV_I_FRAME = 0;

export class QOVEncoder {
	readonly config:QOVVideoConfig;

	private readonly frames:Blob[] = [];
	private previous?:ArrayBuffer;

	constructor(config:QOVVideoConfig) {
		this.config = config;
	}

	writeFrame(data:ArrayBuffer, iframe?:boolean):ArrayBuffer {
		let result:ArrayBuffer;
		if(iframe || !this.previous)
			result = this.encodeIFrame(data);
		else
			result = this.encodePFrame(data, this.previous);
		this.frames.push(new Blob([result]));
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

	private encodeIFrame(data:ArrayBuffer):ArrayBuffer {
		const qoi = QOI.encode({...this.config, colorspace:0, data});
		const result = qoi.slice(QOI.QOI_HEADER_SIZE - 1, qoi.byteLength - QOI.QOI_PADDING_SIZE);
		new Uint8Array(result)[0] = QOV_I_FRAME;
		return result;
	}

	private encodePFrame(data:ArrayBuffer, previous:ArrayBuffer):ArrayBuffer {
		const {channels, height, width} = this.config;
		const index = new Uint32Array(64);
		const max_size = width * height * (channels + 1) + QOV_FRAME_HEADER_SIZE;
		const bytes = new Uint8Array(max_size);
		bytes[0] = QOV_P_FRAME;
		const pixels = new Uint8Array(data);
		const previousPixels = new Uint8Array(previous);
		const px_len = width * height * channels;
		const px_end = px_len - channels;

		let run = 0;
		let p = QOV_FRAME_HEADER_SIZE;
		for(let px_pos = 0; px_pos < px_len; px_pos += channels) {
			const px_r = pixels[px_pos]!;
			const px_g = pixels[px_pos + 1]!;
			const px_b = pixels[px_pos + 2]!;
			const px_a = pixels[px_pos + 3]!;
			const px = QOI.rgba2px(px_r, px_g, px_b, px_a);

			const px_prev_r = previousPixels[px_pos]!;
			const px_prev_g = previousPixels[px_pos + 1]!;
			const px_prev_b = previousPixels[px_pos + 2]!;
			const px_prev_a = previousPixels[px_pos + 3]!;
			const px_prev = QOI.rgba2px(px_prev_r, px_prev_g, px_prev_b, px_prev_a);

			if(px === px_prev) {
				run++;
				if(run === 62 || px_pos === px_end) {
					bytes[p++] = QOI.QOI_OP_RUN | (run - 1);
					run = 0;
				}
			} else {
				if(run > 0) {
					bytes[p++] = QOI.QOI_OP_RUN | (run - 1);
					run = 0;
				}
				
				const index_pos = QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a);
				if(index[index_pos] === px) {
					bytes[p++] = QOI.QOI_OP_INDEX | index_pos;
				} else {
					index[index_pos] = px;

					if (px_a === px_prev_a) {
						const vr = px_r - px_prev_r;
						const vg = px_g - px_prev_g;
						const vb = px_b - px_prev_b;
						const vg_r = vr - vg;
						const vg_b = vb - vg;

						if(
							vr > -3 && vr < 2 &&
							vg > -3 && vg < 2 &&
							vb > -3 && vb < 2
						) {
							bytes[p++] = QOI.QOI_OP_DIFF | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2);
						} else if(
							vg_r > -9 && vg_r <  8 &&
							vg > -33 && vg < 32 &&
							vg_b > -9 && vg_b < 8
						) {
							bytes[p++] = QOI.QOI_OP_LUMA | (vg + 32);
							bytes[p++] = (vg_r + 8) << 4 | (vg_b +  8);
						} else {
							bytes[p++] = QOI.QOI_OP_RGB;
							bytes[p++] = px_r;
							bytes[p++] = px_g;
							bytes[p++] = px_b;
						}
					} else {
						bytes[p++] = QOI.QOI_OP_RGBA;
						bytes[p++] = px_r;
						bytes[p++] = px_g;
						bytes[p++] = px_b;
						bytes[p++] = px_a;
					}
				}
			}
		}

		return bytes.slice(0, p).buffer;
	}
}

export class QOVDecoder {
	readonly source:Blob;

	private header?:QOVHeader;
	private state:QOVDecoderState = {nextFrame:0};

	constructor(source:Blob) {
		this.source = source;
	}

	async readHeader():Promise<QOVHeader> {
		const {header, source} = this;
		if(header)
			return header;
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
		this.header = {size, video:{width, height, channels, frameRate}, frames, framePositions};
		return this.header;
	}

	async readFrame():Promise<ArrayBuffer> {
		const {source, state} = this;
		const header = await this.readHeader();
		const start = header.framePositions[state.nextFrame]!;
		const end = header.framePositions[state.nextFrame+1];
		const frame = await source.slice(start, end).arrayBuffer();
		const bytes = new Uint8Array(frame);
		const previous = this.state.previous;
		const result =  this.decode(header, bytes,
			bytes[0] === QOV_P_FRAME && previous ? new Uint8Array(previous) : undefined);
		state.nextFrame++;
		state.previous = result;
		return result;
	}

	private decode(header:QOVHeader, source:ArrayBuffer, previous?:Uint8Array):ArrayBuffer {
		const {channels, height, width} = header.video;
		const px_len = width * height * channels;

		const bytes = new Uint8Array(source);
		const index = new Uint32Array(64);
		const pixels = new Uint8Array(px_len);
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
				if (b1 === QOI.QOI_OP_RGB) {
					px_r = bytes[p++]!;
					px_g = bytes[p++]!;
					px_b = bytes[p++]!;
					index[QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI.rgba2px(px_r, px_g, px_b, px_a);
				} else if (b1 === QOI.QOI_OP_RGBA) {
					px_r = bytes[p++]!;
					px_g = bytes[p++]!;
					px_b = bytes[p++]!;
					px_a = bytes[p++]!;
					index[QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI.rgba2px(px_r, px_g, px_b, px_a);
				} else {
					const op = b1 & QOI.QOI_MASK_2;
					if (op === QOI.QOI_OP_INDEX) {
						const px = index[b1]!;
						px_r = px >> 24 & 0xff;
						px_g = px >> 16 & 0xff;
						px_b = px >> 8 & 0xff;
						px_a = px & 0xff;
						index[QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = px;
					} else if (op === QOI.QOI_OP_DIFF) {
						px_r += ((b1 >> 4) & 0x03) - 2;
						px_g += ((b1 >> 2) & 0x03) - 2;
						px_b += (b1 & 0x03) - 2;
						index[QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI.rgba2px(px_r, px_g, px_b, px_a);
					} else if (op === QOI.QOI_OP_LUMA) {
						const b2 = bytes[p++]!;
						const vg = (b1 & 0x3f) - 32;
						px_r += vg - 8 + ((b2 >> 4) & 0x0f);
						px_g += vg;
						px_b += vg - 8 +  (b2 & 0x0f);
						index[QOI.QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI.rgba2px(px_r, px_g, px_b, px_a);
					} else if (op === QOI.QOI_OP_RUN) {
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

type QOVDecoderState = {
	nextFrame:number;
	previous?:ArrayBuffer;
}