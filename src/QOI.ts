export const QOI_MAGIC = 0x716f6966; // [...new TextEncoder().encode("qoif")].map(item => item.toString(16)).join("")
export const QOI_HEADER_SIZE = 14;
export const QOI_COLOR_HASH = (r:number, g:number, b:number, a:number):number => (r * 3 + g * 5 + b * 7 + a * 11) % 64;
export const QOI_OP_INDEX = 0x00 // 00xxxxxx
export const QOI_OP_DIFF = 0x40 // 01xxxxxx
export const QOI_OP_LUMA = 0x80 // 10xxxxxx
export const QOI_OP_RUN = 0xc0 // 11xxxxxx
export const QOI_OP_RGB = 0xfe // 11111110
export const QOI_OP_RGBA = 0xff // 11111111
export const QOI_MASK_2 = 0xc0 // 11000000
export const qoi_padding = [0, 0, 0, 0, 0, 0, 0, 1];
export const QOI_PADDING_SIZE = qoi_padding.length

export const rgba2px = (r:number, g:number, b:number, a:number):number => 
	(r << 24 | g << 16 | b << 8 | a) >>> 0;

export function encode(source:Image):ArrayBuffer {
	const {channels, colorspace, data, height, width} = source;
	const index = new Uint32Array(64);
	const max_size = width * height * (channels + 1) + QOI_HEADER_SIZE + QOI_PADDING_SIZE;
	const bytes = new Uint8Array(max_size);

	const header = new DataView(bytes.buffer);
	header.setUint32(0, QOI_MAGIC);
	header.setUint32(4, width);
	header.setUint32(8, height);
	header.setUint8(12, channels);
	header.setUint8(13, colorspace);
	let p = QOI_HEADER_SIZE;

	const pixels = new Uint8Array(data);

	let run = 0;
	let px_prev_r = 0;
	let px_prev_g = 0;
	let px_prev_b = 0;
	let px_prev_a = 255;
	let px_prev = px_prev_a;

	const px_len = width * height * channels;
	const px_end = px_len - channels;
	for(let px_pos = 0; px_pos < px_len; px_pos += channels) {
		const px_r = pixels[px_pos]!;
		const px_g = pixels[px_pos + 1]!;
		const px_b = pixels[px_pos + 2]!;
		const px_a = pixels[px_pos + 3]!;
		const px = rgba2px(px_r, px_g, px_b, px_a);

		if(px === px_prev) {
			run++;
			if(run === 62 || px_pos === px_end) {
				bytes[p++] = QOI_OP_RUN | (run - 1);
				run = 0;
			}
		} else {
			if(run > 0) {
				bytes[p++] = QOI_OP_RUN | (run - 1);
				run = 0;
			}
			
			const index_pos = QOI_COLOR_HASH(px_r, px_g, px_b, px_a);
			if(index[index_pos] === px) {
				bytes[p++] = QOI_OP_INDEX | index_pos;
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
						bytes[p++] = QOI_OP_DIFF | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2);
					} else if(
						vg_r > -9 && vg_r <  8 &&
						vg > -33 && vg < 32 &&
						vg_b > -9 && vg_b < 8
					) {
						bytes[p++] = QOI_OP_LUMA | (vg + 32);
						bytes[p++] = (vg_r + 8) << 4 | (vg_b +  8);
					} else {
						bytes[p++] = QOI_OP_RGB;
						bytes[p++] = px_r;
						bytes[p++] = px_g;
						bytes[p++] = px_b;
					}
				} else {
					bytes[p++] = QOI_OP_RGBA;
					bytes[p++] = px_r;
					bytes[p++] = px_g;
					bytes[p++] = px_b;
					bytes[p++] = px_a;
				}
			}
		}
		px_prev_r = px_r;
		px_prev_g = px_g;
		px_prev_b = px_b;
		px_prev_a = px_a;
		px_prev = px;
	}

	for(const padding of qoi_padding)
		bytes[p++] = padding;
	return bytes.slice(0, p).buffer;
}

export function decode(source:ArrayBuffer):Image {
	const bytes = new Uint8Array(source);
	const header = new DataView(bytes.buffer);
	//const header_magic = header.getUint32(0);
	const width = header.getUint32(4);
	const height = header.getUint32(8);
	const channels = header.getUint8(12);
	const colorspace = header.getUint8(13);

	const px_len = width * height * channels;
	const pixels = new Uint8Array(px_len);

	const index = new Uint32Array(64);
	let px_r = 0;
	let px_g = 0;
	let px_b = 0;
	let px_a = 255;
	let run = 0;
	let p = QOI_HEADER_SIZE;

	for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
		if (run > 0) {
			run--;
		} else {
			const b1 = bytes[p++]!;
			if (b1 === QOI_OP_RGB) {
				px_r = bytes[p++]!;
				px_g = bytes[p++]!;
				px_b = bytes[p++]!;
				index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = rgba2px(px_r, px_g, px_b, px_a);
			} else if (b1 === QOI_OP_RGBA) {
				px_r = bytes[p++]!;
				px_g = bytes[p++]!;
				px_b = bytes[p++]!;
				px_a = bytes[p++]!;
				index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = rgba2px(px_r, px_g, px_b, px_a);
			} else {
				const op = b1 & QOI_MASK_2;
				if (op === QOI_OP_INDEX) {
					const px = index[b1]!;
					px_r = px >> 24 & 0xff;
					px_g = px >> 16 & 0xff;
					px_b = px >> 8 & 0xff;
					px_a = px & 0xff;
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = px;
				} else if (op === QOI_OP_DIFF) {
					px_r += ((b1 >> 4) & 0x03) - 2;
					px_g += ((b1 >> 2) & 0x03) - 2;
					px_b += (b1 & 0x03) - 2;
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = rgba2px(px_r, px_g, px_b, px_a);
				} else if (op === QOI_OP_LUMA) {
					const b2 = bytes[p++]!;
					const vg = (b1 & 0x3f) - 32;
					px_r += vg - 8 + ((b2 >> 4) & 0x0f);
					px_g += vg;
					px_b += vg - 8 +  (b2 & 0x0f);
					index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = rgba2px(px_r, px_g, px_b, px_a);
				} else if (op === QOI_OP_RUN) {
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

	return {width, height, channels, colorspace, data:pixels.buffer};
}

type Image = {
	readonly width:number;
	readonly height:number;
	readonly channels:number;
	readonly colorspace:number;
	readonly data:ArrayBuffer;
}