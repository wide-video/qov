# QOV

POC for lossless video encoding based on [QOI](https://qoiformat.org/).

Check out [demo](https://wide-video.github.io/qov/static/demo.html).

## Spec

- QOV format provides a custom header, followed by I-Frames and P-Frames
- QOV I-Frame is similiar to QOI payload (header stripped)
- QOV P-Frame uses customized QOI algorithm, where OPs are based on *previous frame pixel*, instead of previous pixel from the same frame.

## Build & Run

```
npm i                          # install dependecies
npx webpack --mode production  # compile app
http-server                    # run http server
```

Check out [demo.html](http://localhost:8080/static/demo.html) & [test.html](http://localhost:8080/static/test.html).


## Performance

[demo.html](http://localhost:8080/static/demo.html) would compile `bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4` into .QOV in 53 seconds, 2GB file.

FFV1 produces 1.68GB output in ~60 seconds using the following configuration:

```
ffmpeg -i bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4 -an -vcodec ffv1 -level 3 -f matroska -pix_fmt rgb24 bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4.ffv1
```

