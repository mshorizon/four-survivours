# Visual Reference

`reference.jpg` — Save the uploaded screenshot here as `reference.jpg`.

## Key observations from the reference image

### Camera
- Isometric ~50-55° angle (NOT straight top-down), slight perspective
- Camera follows player group, smooth lerp

### Art Style
- Voxel/blocky characters (separate BoxGeometry head + body, like Minecraft)
- 4 player colors: blue cap, red hoodie, green hoodie, pink hair
- Zombies: muted green/grey, same voxel style
- NO textures — flat MeshLambertMaterial colors only

### Map (urban crossroads)
- Red brick buildings on corners
- Dark asphalt roads forming a cross/intersection
- Yellow taxi, white ambulance (box cars), barricades
- Gas station in background
- Dark moody atmosphere with orange fire light

### HUD (reference)
- Top-left: 4 player panels (avatar color square, name, HP bar, weapon/ammo)
- Top-center: "ZOMBIE HORDE: SURVIVAL" title
- Top-right: "WAVE 7" large + "OBJECTIVE: REACH THE SAFE ROOM"

### Effects
- Muzzle flash: PointLight orange/yellow, ~80ms
- Blood: red sphere particles on enemy hit
- Fire: animated PointLight flicker on burning cars
