# QOV

POC for lossless video encoding based on [QOI](https://qoiformat.org/).

## Build & Run

```
npm i                          # install dependecies
npx webpack --mode production  # compile app
http-server ./dist             # run http server
```

Check [demo.html](http://localhost:8080/demo.html) & [test.html](http://localhost:8080/test.html).


## Compare

[demo.html](http://localhost:8080/demo.html) compiles `bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4` into .QOV in 53 seconds, 2GB file.

FFV1 produces 1.68GB output in ~60 seconds using the following configuration:

```
ffmpeg -i bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4 -an -vcodec ffv1 -level 3 -f matroska -pix_fmt rgb24 bbb_h264_1920x1080_60fps_aac_stereo_30s_11MB.mp4.ffv1
```

