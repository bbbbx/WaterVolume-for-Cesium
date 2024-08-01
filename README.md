# WaterVolume-for-Cesium

## Preview

|     View    |                                           Preview                                               |
|:-----------:|:-----------------------------------------------------------------------------------------------:|
| Above Water | ![WaterVolume](https://github.com/user-attachments/assets/9bb62871-8a10-4a21-8f89-5d3addd06b62) |
| Under Water | ![Under Water](https://github.com/user-attachments/assets/dcf0c2d0-1c11-4128-9ad6-8d4fea65baea) |

[preview-a.webm](https://github.com/user-attachments/assets/8daa4de4-fd8e-457c-8b89-313262e43c52)

[preview-b.webm](https://github.com/user-attachments/assets/f3bd1843-0a73-4f9f-8d7b-2f373ae7e788)

## Feature

- Gerstner wave
- reflection
- refraction
- scattering
- absorption
- caustic
- foam
- under water view

## Usage

```js
const waterVolume = new WaterVolume({
  polygonHierarchy: polygonHierarchy,
  topHeight: 200.0,
});
viewer.scene.primitives.add(waterVolume);
```

See [cesium-1.119/Apps/Sandcastle/gallery/WaterVolume.html](cesium-1.119/Apps/Sandcastle/gallery/WaterVolume.html) for more details.

## Demo

```bash
npm install
npm run build
npm run start
```

then open [http://localhost:8080/Apps/Sandcastle/index.html?src=WaterVolume.html](http://localhost:8080/Apps/Sandcastle/index.html?src=WaterVolume.html).

## Documentation

```bash
npm install
npm run build-docs
npm run start
```

then open [http://localhost:8080/Build/Documentation/WaterVolume.html](http://localhost:8080/Build/Documentation/WaterVolume.html).
