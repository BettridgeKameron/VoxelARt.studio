import * as THREE from 'three';
import {
    OrbitControls
} from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

class VoxelWorld {

    constructor(options) {
        this.cellSize = options.cellSize;
        const {
            cellSize
        } = this;
        this.cellSliceSize = cellSize * cellSize;
        this.cells = {};

    }
    computeVoxelOffset(x, y, z) {

        const {
            cellSize,
            cellSliceSize
        } = this;
        const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
        const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
        const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
        return voxelY * cellSliceSize +
            voxelZ * cellSize +
            voxelX;

    }
    computeCellId(x, y, z) {

        const {
            cellSize
        } = this;
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const cellZ = Math.floor(z / cellSize);
        return `${cellX},${cellY},${cellZ}`;

    }
    addCellForVoxel(x, y, z) {

        const cellId = this.computeCellId(x, y, z);
        let cell = this.cells[cellId];
        if (!cell) {

            const {
                cellSize
            } = this;
            cell = new Uint8Array(cellSize * cellSize * cellSize);
            this.cells[cellId] = cell;

        }

        return cell;

    }
    getCellForVoxel(x, y, z) {

        return this.cells[this.computeCellId(x, y, z)];

    }
    setVoxel(x, y, z, v, addCell = true) {

        let cell = this.getCellForVoxel(x, y, z);
        if (!cell) {

            if (!addCell) {

                return;

            }

            cell = this.addCellForVoxel(x, y, z);

        }

        const voxelOffset = this.computeVoxelOffset(x, y, z);
        cell[voxelOffset] = v;

    }
    getVoxel(x, y, z) {

        const cell = this.getCellForVoxel(x, y, z);
        if (!cell) {

            return 0;

        }

        const voxelOffset = this.computeVoxelOffset(x, y, z);
        return cell[voxelOffset];

    }
    generateGeometryDataForCell(cellX, cellY, cellZ) {
        const {
            cellSize
        } = this;
        const positions = [];
        const normals = [];
        const indices = [];
        const colors = []; // Add an array to hold color values
        const startX = cellX * cellSize;
        const startY = cellY * cellSize;
        const startZ = cellZ * cellSize;

        for (let y = 0; y < cellSize; ++y) {
            const voxelY = startY + y;
            for (let z = 0; z < cellSize; ++z) {
                const voxelZ = startZ + z;
                for (let x = 0; x < cellSize; ++x) {
                    const voxelX = startX + x;
                    const voxel = this.getVoxel(voxelX, voxelY, voxelZ);
                    if (voxel) {
                        const colorPalette = [
                            0x000000, 0xffffff, 0x000000, 0xff0000, 0xff5500,
                            0xffaa00, 0xffff00, 0x00ff00, 0x00ffff, 0x4d94ff,
                            0x0000ff, 0xff00ff
                        ];
                        const customColorLabels = document.querySelectorAll('.custom-color');

                        customColorLabels.forEach((label, index) => {
                            colorPalette.push(parseInt(label.dataset.color.replace('#', '0x'), 16));
                        });
                        const colorIndex = voxel % colorPalette.length;
                        const voxelColor = new THREE.Color(colorPalette[colorIndex]);
                        for (const {
                            dir,
                            corners
                        }
                            of VoxelWorld.faces) {
                            const neighbor = this.getVoxel(
                                voxelX + dir[0],
                                voxelY + dir[1],
                                voxelZ + dir[2]
                            );
                            if (!neighbor) {
                                const ndx = positions.length / 3;
                                for (const corner of corners) {
                                    positions.push(corner[0] + x, corner[1] + y, corner[2] + z);
                                    normals.push(...dir);
                                    colors.push(voxelColor.r, voxelColor.g, voxelColor.b);
                                }
                                indices.push(
                                    ndx, ndx + 1, ndx + 2,
                                    ndx + 2, ndx + 1, ndx + 3,
                                );
                            }
                        }
                    }
                }
            }
        }
        return {
            positions,
            normals,
            colors,
            indices,
        };
    }


    // from
    // https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.42.3443&rep=rep1&type=pdf
    intersectRay(start, end) {

        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let dz = end.z - start.z;
        const lenSq = dx * dx + dy * dy + dz * dz;
        const len = Math.sqrt(lenSq);

        dx /= len;
        dy /= len;
        dz /= len;

        let t = 0.0;
        let ix = Math.floor(start.x);
        let iy = Math.floor(start.y);
        let iz = Math.floor(start.z);

        const stepX = (dx > 0) ? 1 : -1;
        const stepY = (dy > 0) ? 1 : -1;
        const stepZ = (dz > 0) ? 1 : -1;

        const txDelta = Math.abs(1 / dx);
        const tyDelta = Math.abs(1 / dy);
        const tzDelta = Math.abs(1 / dz);

        const xDist = (stepX > 0) ? (ix + 1 - start.x) : (start.x - ix);
        const yDist = (stepY > 0) ? (iy + 1 - start.y) : (start.y - iy);
        const zDist = (stepZ > 0) ? (iz + 1 - start.z) : (start.z - iz);

        // location of nearest voxel boundary, in units of t
        let txMax = (txDelta < Infinity) ? txDelta * xDist : Infinity;
        let tyMax = (tyDelta < Infinity) ? tyDelta * yDist : Infinity;
        let tzMax = (tzDelta < Infinity) ? tzDelta * zDist : Infinity;

        let steppedIndex = -1;

        // main loop along raycast vector
        while (t <= len) {

            const voxel = this.getVoxel(ix, iy, iz);
            if (voxel) {

                return {
                    position: [
                        start.x + t * dx,
                        start.y + t * dy,
                        start.z + t * dz,
                    ],
                    normal: [
                        steppedIndex === 0 ? -stepX : 0,
                        steppedIndex === 1 ? -stepY : 0,
                        steppedIndex === 2 ? -stepZ : 0,
                    ],
                    voxel,
                };

            }

            // advance t to next nearest voxel boundary
            if (txMax < tyMax) {

                if (txMax < tzMax) {

                    ix += stepX;
                    t = txMax;
                    txMax += txDelta;
                    steppedIndex = 0;

                } else {

                    iz += stepZ;
                    t = tzMax;
                    tzMax += tzDelta;
                    steppedIndex = 2;

                }

            } else {

                if (tyMax < tzMax) {

                    iy += stepY;
                    t = tyMax;
                    tyMax += tyDelta;
                    steppedIndex = 1;

                } else {

                    iz += stepZ;
                    t = tzMax;
                    tzMax += tzDelta;
                    steppedIndex = 2;

                }

            }

        }

        return null;

    }

    serialize() {
        const cells = Object.entries(this.cells).map(([key, value]) => ({
            key,
            value: Array.from(value)
        }));
        const customColorLabels = document.querySelectorAll('.custom-color');
        const customColors = Array.from(customColorLabels).map(label => label.dataset.color);
        const backgroundColor = bgColorPicker.value;
        return JSON.stringify({ cellSize: this.cellSize, cells, customColors, backgroundColor });
    }

    deserialize(data) {
        const parsed = JSON.parse(data);
        this.cellSize = parsed.cellSize;
        this.cells = parsed.cells.reduce((acc, { key, value }) => {
            acc[key] = new Uint8Array(value);
            return acc;
        }, {});
        const customColorLabels = document.querySelectorAll('.custom-color');
        parsed.customColors.forEach((color, index) => {
            customColorLabels[index].dataset.color = color;
            customColorLabels[index].style.backgroundColor = color;
        });

        bgColorPicker.value = parsed.backgroundColor;

        // Dispatch a custom event to indicate that the custom colors have been updated
        const event = new CustomEvent('customColorsUpdated', { detail: parsed.customColors });
        document.dispatchEvent(event);
    }

}

VoxelWorld.faces = [{ // left
    dir: [-1, 0, 0],
    corners: [
        [0, 1, 0],
        [0, 0, 0],
        [0, 1, 1],
        [0, 0, 1],
    ],
},
{ // right
    dir: [1, 0, 0],
    corners: [
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 0],
        [1, 0, 0],
    ],
},
{ // bottom
    dir: [0, -1, 0],
    corners: [
        [1, 0, 1],
        [0, 0, 1],
        [1, 0, 0],
        [0, 0, 0],
    ],
},
{ // top
    dir: [0, 1, 0],
    corners: [
        [0, 1, 1],
        [1, 1, 1],
        [0, 1, 0],
        [1, 1, 0],
    ],
},
{ // back
    dir: [0, 0, -1],
    corners: [
        [1, 0, 0],
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
    ],
},
{ // front
    dir: [0, 0, 1],
    corners: [
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
    ],
},
];



class Reticle extends THREE.Mesh {
    constructor() {
        super(
            new THREE.RingBufferGeometry(0.1, 0.12, 32).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({
                color: 0x00FF00, // Bright green
                emissive: 0x00FF00, // Same as the color for a slight glow effect
                emissiveIntensity: 0.5,
                metalness: 0.1,
                roughness: 0.75,
                side: THREE.DoubleSide
            })
        );
        this.matrixAutoUpdate = false;
        this.visible = false;
    }
}

function placeVoxelArtAtReticle(reticle, scene, world) {
    // Assume cell coordinates define which part of the voxel world to render
    const cellX = 0;
    const cellY = 0;
    const cellZ = 0;

    // Generate geometry data from voxel world
    const { positions, normals, colors, indices } = world.generateGeometryDataForCell(cellX, cellY, cellZ);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();

    // Create a mesh with the geometry
    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    });
    const voxelMesh = new THREE.Mesh(geometry, material);

    // Scale the mesh to make it smaller or larger
    const scaleFactor = 0.01; // Adjust this value to scale the voxel art appropriately
    voxelMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Now we adjust the position based on the scaled bounding box
    const scaledHeightOffset = scaleFactor * -geometry.boundingBox.min.y; // Adjust for bottom of the box
    const scaledXOffset = scaleFactor * -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x); // Center X
    const scaledZOffset = scaleFactor * -0.5 * (geometry.boundingBox.max.z - geometry.boundingBox.min.z); // Center Z

    voxelMesh.position.setFromMatrixPosition(reticle.matrix);
    voxelMesh.position.y += scaledHeightOffset;
    voxelMesh.position.x += scaledXOffset;
    voxelMesh.position.z += scaledZOffset;

    // Apply rotation to align with the world, if necessary
    voxelMesh.quaternion.setFromRotationMatrix(reticle.matrix);

    scene.add(voxelMesh);
}




function clearScene(scene) {
    const preservedObjects = new Set(['Light', 'DirectionalLight', 'AmbientLight', 'Reticle']);

    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
        if (!preservedObjects.has(obj.constructor.name)) {
            scene.remove(obj);
        }
    }
}

async function setupARButton(renderer, originalScene, camera) {
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test']
    });

    const arButtonElement = document.getElementById('arButtonCustom');

    // Check if AR is supported
    if (await navigator.xr.isSessionSupported('immersive-ar')) {
        // Update the button text and class
        arButtonElement.textContent = 'Enter AR';
        arButtonElement.className = 'btn btn-success';
        arButtonElement.disabled = false;

        // Add event listener to trigger AR functionality when clicked
        arButtonElement.addEventListener('click', () => {
            document.body.appendChild(arButton);
            arButton.click();
        });
    }

    let arScene;

    renderer.xr.addEventListener('sessionstart', async () => {
        const session = renderer.xr.getSession();

        // Clone the original scene
        arScene = originalScene.clone();

        // Clear the cloned AR scene, except essential objects like lights or UI elements
        clearScene(arScene);
        arScene.background = null;

        const reticle = new Reticle();
        arScene.add(reticle);
        let objectPlaced = false;

        const viewerSpace = await session.requestReferenceSpace('viewer');
        const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

        renderer.setAnimationLoop(() => {
            const frame = renderer.xr.getFrame();
            if (frame) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(renderer.xr.getReferenceSpace());
                    if (pose) {
                        reticle.visible = !objectPlaced;
                        reticle.matrix.fromArray(pose.transform.matrix);
                    }
                } else {
                    reticle.visible = false;
                }
            }
            renderer.render(arScene, camera);
        });

        session.addEventListener('select', () => {
            if (reticle.visible && !objectPlaced) {
                placeVoxelArtAtReticle(reticle, arScene, world);
                objectPlaced = true;
                reticle.visible = false;
            }
        });
    });

    renderer.xr.addEventListener('sessionend', () => {
        document.getElementById('ARButton').remove();
        renderer.setAnimationLoop(null);

        // Dispose of the AR scene
        arScene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        });

        // Switch back to the original scene
        renderer.render(originalScene, camera);
    });
}




let world;

function main() {
    const undoStack = [];
    const redoStack = [];
    const canvas = document.querySelector('#c');
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas,
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.xr.enabled = true;

    const cellSize = 32;

    const fov = 75;
    const aspect = 2; // the canvas default
    const near = 0.1;
    const far = 1000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(-cellSize * .3, cellSize * .8, -cellSize * .3);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(cellSize / 2, cellSize / 3, cellSize / 2);
    controls.update();

    const bgColorPicker = document.getElementById('bgColorPicker');
    const scene = new THREE.Scene();

    // Load background color from local storage
    const storedBgColor = localStorage.getItem('bgColor') || '#d3d3d3';
    bgColorPicker.value = storedBgColor;
    scene.background = new THREE.Color(storedBgColor);

    bgColorPicker.addEventListener('input', () => {
        const selectedColor = bgColorPicker.value;
        scene.background = new THREE.Color(selectedColor);
        localStorage.setItem('bgColor', selectedColor);
    });


    function addLight(x, y, z, targetX, targetY, targetZ) {
        const color = 0xFFFFFF;
        const intensity = .45;
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(x, y, z);
        light.target.position.set(targetX, targetY, targetZ);
        scene.add(light);
        scene.add(light.target); // Don't forget to add the target to the scene
    }

    // Example setup, adjust angles as necessary
    addLight(-1, cellSize, 4, 0, cellSize * 0.5, 0); // Pointing towards the center
    addLight(1, cellSize, -2, 0, cellSize * 0.5, 0); // Pointing towards the center


    function addAmbientLight() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35); // soft white light
        scene.add(ambientLight);
    }
    addAmbientLight();


    world = new VoxelWorld({
        cellSize
    });

    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: false
    });

    const cellIdToMesh = {};

    function updateCellGeometry(x, y, z) {
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const cellZ = Math.floor(z / cellSize);
        const cellId = world.computeCellId(x, y, z);
        let mesh = cellIdToMesh[cellId];
        const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();

        const {
            positions,
            normals,
            colors,
            indices
        } = world.generateGeometryDataForCell(cellX, cellY, cellZ);
        const positionNumComponents = 3;
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
        const normalNumComponents = 3;
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
        const colorNumComponents = 3; // There are 3 components (R, G, B) per vertex color
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), colorNumComponents));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        if (!mesh) {
            mesh = new THREE.Mesh(geometry, material);
            mesh.name = cellId;
            cellIdToMesh[cellId] = mesh;
            scene.add(mesh);
            mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize);
        }
    }

    const neighborOffsets = [
        [0, 0, 0], // self
        [-1, 0, 0], // left
        [1, 0, 0], // right
        [0, -1, 0], // down
        [0, 1, 0], // up
        [0, 0, -1], // back
        [0, 0, 1], // front
    ];

    function updateVoxelGeometry(x, y, z) {

        const updatedCellIds = {};
        for (const offset of neighborOffsets) {

            const ox = x + offset[0];
            const oy = y + offset[1];
            const oz = z + offset[2];
            const cellId = world.computeCellId(ox, oy, oz);
            if (!updatedCellIds[cellId]) {

                updatedCellIds[cellId] = true;
                updateCellGeometry(ox, oy, oz);

            }

        }

    }

    function togglePlane() {
        const planeExists = world.getVoxel(0, 0, 0) !== 0;
        if (planeExists) {
            removePlane();
        } else {
            generatePlane();
        }
    }
    window.togglePlane = togglePlane;

    function removePlane() {
        for (let z = 0; z < cellSize; ++z) {
            for (let x = 0; x < cellSize; ++x) {
                world.setVoxel(x, 0, z, 0);
            }
        }
        updateVoxelGeometry(1, 1, 1);
        saveWorldState(); // Save the updated world state
    }

    function generatePlane() {
        for (let z = 0; z < cellSize; ++z) {
            for (let x = 0; x < cellSize; ++x) {
                world.setVoxel(x, 0, z, 1);
            }
        }
        updateVoxelGeometry(1, 1, 1);
        saveWorldState(); // Save the updated world state
    }

    function updateAllGeometry() {
        Object.keys(world.cells).forEach(cellId => {
            const [x, y, z] = cellId.split(',').map(Number);
            updateVoxelGeometry(x * world.cellSize, y * world.cellSize, z * world.cellSize);
        });
    }

    function initializeWorld() {
        // Priority to URL hash
        if (location.hash) {
            const hashData = location.hash.substring(1); // Remove the '#' character
            try {
                const compressedData = atob(decodeURIComponent(hashData));
                const data = pako.inflate(compressedData, { to: 'string' });
                world.deserialize(data);
                loadCells();
                updateAllGeometry(); // Update geometry immediately
                const parsed = JSON.parse(data);
                scene.background = new THREE.Color(parsed.backgroundColor); // Set the background color

                // Update custom color labels and color pickers
                const customColorLabels = document.querySelectorAll('.custom-color');
                const colorPickers = document.querySelectorAll('#colorPicker1, #colorPicker2, #colorPicker3');
                parsed.customColors.forEach((color, index) => {
                    customColorLabels[index].dataset.color = color;
                    customColorLabels[index].style.backgroundColor = color;
                    colorPickers[index].value = color;
                });

                console.log("World loaded from URL hash.");

                // Update local storage with new data
                localStorage.setItem('worldData', data);

                // Clear the URL hash
                history.pushState("", document.title, location.pathname + location.search);
            } catch (e) {
                console.error("Failed to load world from hash", e);
            }
        } else {
            // Fallback to local storage
            const localData = localStorage.getItem('worldData');
            if (localData) {
                world.deserialize(localData);
                loadCells();
                updateAllGeometry(); // Update geometry immediately
                const parsed = JSON.parse(localData);
                scene.background = new THREE.Color(parsed.backgroundColor); // Set the background color
                console.log("World loaded from local storage.");
            } else {
                // Default initialization if no data found anywhere
                generatePlane();
            }
        }
    }

    initializeWorld();

    function loadCells() {
        Object.keys(world.cells).forEach(cellId => {
            const [x, y, z] = cellId.split(',').map(Number);
            updateCellGeometry(x * world.cellSize, y * world.cellSize, z * world.cellSize);
        });
    }

    function resetWorld() {
        Object.keys(world.cells).forEach(cellId => {
            const cell = world.cells[cellId];
            cell.fill(0);
        });

        // Update geometry for all cells
        Object.keys(world.cells).forEach(cellId => {
            const [x, y, z] = cellId.split(',').map(Number);
            updateCellGeometry(x * world.cellSize, y * world.cellSize, z * world.cellSize);
        });
        generatePlane();
        redoStack.length = 0;
        undoStack.length = 0;

        const defaultBgColor = '#d3d3d3';
        bgColorPicker.value = defaultBgColor;
        scene.background = new THREE.Color(defaultBgColor);
        localStorage.setItem('bgColor', defaultBgColor);

        // Save the reset world state to local storage
        saveWorldState();

        // Optionally, log the reset action
        console.log("World has been reset to initial state.");
    }
    window.resetWorld = resetWorld;

    function saveWorldState() {
        const data = world.serialize();
        localStorage.setItem('worldData', data);
    }

    document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
        elem.addEventListener('change', function () {
            if (this.checked) {
                saveWorldState(); // Save world state when a voxel is changed
            }
        });
    });
    window.addEventListener('beforeunload', saveWorldState);

    function resizeRendererToDisplaySize(renderer) {

        const canvas = renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const needResize = canvas.width !== width || canvas.height !== height;
        if (needResize) {

            renderer.setSize(width, height, false);

        }

        return needResize;

    }

    let renderRequested = false;

    function render() {

        renderRequested = undefined;

        if (resizeRendererToDisplaySize(renderer)) {

            const canvas = renderer.domElement;
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();

        }

        controls.update();
        renderer.render(scene, camera);

    }

    render();

    function requestRenderIfNotRequested() {

        if (!renderRequested) {

            renderRequested = true;
            requestAnimationFrame(render);

        }

    }

    let currentVoxel = -1;
    let currentId;

    document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
        elem.addEventListener('click', function () {
            if (this.id === currentId) {
                this.checked = false;
                currentId = undefined;
                currentVoxel = -1;
            } else {
                currentId = this.id;
                currentVoxel = parseInt(this.value);
            }
        });
    });

    function getCanvasRelativePosition(event) {

        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * canvas.width / rect.width,
            y: (event.clientY - rect.top) * canvas.height / rect.height,
        };

    }

    function placeVoxel(event) {
        if (currentVoxel === -1) return;
        const pos = getCanvasRelativePosition(event);
        const x = (pos.x / canvas.width) * 2 - 1;
        const y = (pos.y / canvas.height) * -2 + 1; // note we flip Y

        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        start.setFromMatrixPosition(camera.matrixWorld);
        end.set(x, y, 1).unproject(camera);

        const intersection = world.intersectRay(start, end);
        if (intersection) {
            const voxelId = event.shiftKey ? 0 : currentVoxel;
            const pos = intersection.position.map((v, ndx) => {
                return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);
            });

            // Save the current state before making changes
            undoStack.push(world.serialize());
            redoStack.length = 0; // Clear the redo stack

            // Remove the oldest state if the undo stack exceeds the limit
            if (undoStack.length > 50) {
                undoStack.shift();
            }

            world.setVoxel(...pos, voxelId);
            updateVoxelGeometry(...pos);
            requestRenderIfNotRequested();
        }
    }

    window.undo = function () {
        if (undoStack.length > 0) {
            const previousState = undoStack.pop();
            redoStack.push(world.serialize()); // Save the current state to the redo stack
            world.deserialize(previousState);
            loadCells();
            requestRenderIfNotRequested();
        }
    };

    window.redo = function () {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            undoStack.push(world.serialize()); // Save the current state to the undo stack
            world.deserialize(nextState);
            loadCells();
            requestRenderIfNotRequested();
        }
    };

    const mouse = {
        x: 0,
        y: 0,
    };

    function recordStartPosition(event) {

        mouse.x = event.clientX;
        mouse.y = event.clientY;
        mouse.moveX = 0;
        mouse.moveY = 0;

    }

    function recordMovement(event) {

        mouse.moveX += Math.abs(mouse.x - event.clientX);
        mouse.moveY += Math.abs(mouse.y - event.clientY);

    }

    function placeVoxelIfNoMovement(event) {

        if (mouse.moveX < 5 && mouse.moveY < 5) {

            placeVoxel(event);

        }

        window.removeEventListener('pointermove', recordMovement);
        window.removeEventListener('pointerup', placeVoxelIfNoMovement);

    }

    canvas.addEventListener('pointerdown', (event) => {

        event.preventDefault();
        recordStartPosition(event);
        window.addEventListener('pointermove', recordMovement);
        window.addEventListener('pointerup', placeVoxelIfNoMovement);

    }, {
        passive: false
    });
    canvas.addEventListener('touchstart', (event) => {

        // prevent scrolling
        event.preventDefault();

    }, {
        passive: false
    });

    controls.addEventListener('change', requestRenderIfNotRequested);
    window.addEventListener('resize', requestRenderIfNotRequested);
    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
    });
    setupARButton(renderer, scene, camera);
    const customColorLabels = document.querySelectorAll('.custom-color');
    const colorPickers = document.querySelectorAll('#colorPicker1, #colorPicker2, #colorPicker3');

    // Load custom colors from local storage
    const storedColors = JSON.parse(localStorage.getItem('customColors')) || ['#000000', '#000000'];
    customColorLabels.forEach((label, index) => {
        label.dataset.color = storedColors[index];
        label.style.backgroundColor = storedColors[index];
    });

    customColorLabels.forEach((label, index) => {
        label.addEventListener('click', () => {
            colorPickers[index].click();
        });
    });

    colorPickers.forEach((picker, index) => {
        picker.value = customColorLabels[index].dataset.color;
        picker.addEventListener('input', () => {
            const selectedColor = picker.value;
            customColorLabels[index].dataset.color = selectedColor;
            customColorLabels[index].style.backgroundColor = selectedColor;
            localStorage.setItem('customColors', JSON.stringify([
                customColorLabels[0].dataset.color,
                customColorLabels[1].dataset.color,
                customColorLabels[2].dataset.color
            ]));
        });
    });
    const resetBgColorButton = document.getElementById('resetBgColor');

    resetBgColorButton.addEventListener('click', () => {
        const defaultBgColor = '#d3d3d3';
        bgColorPicker.value = defaultBgColor;
        scene.background = new THREE.Color(defaultBgColor);
        localStorage.setItem('bgColor', defaultBgColor);
    });

    document.addEventListener('customColorsUpdated', (event) => {
        const customColors = event.detail;
        colorPickers.forEach((picker, index) => {
            picker.value = customColors[index];
        });
    });
    document.addEventListener('DOMContentLoaded', function () {
        // Initialize local storage with default values if they don't exist
        function initializeLocalStorage() {
            // Default background color
            if (!localStorage.getItem('bgColor')) {
                localStorage.setItem('bgColor', '#d3d3d3');  // Default light grey background
            }

            // Default custom colors
            if (!localStorage.getItem('customColors')) {
                const defaultColors = ['#000000', '#000000', '#000000']; // Default black colors
                localStorage.setItem('customColors', JSON.stringify(defaultColors));
            }

            // Default world data, if you have a default setup for new visitors
            if (!localStorage.getItem('worldData')) {
                // Assuming you have a function to serialize a default world setup
                const defaultWorldData = {}; // You would need to define what a default world looks like
                localStorage.setItem('worldData', JSON.stringify(defaultWorldData));
            }

            // Initialize UI elements with these values
            document.getElementById('bgColorPicker').value = localStorage.getItem('bgColor');
            const customColors = JSON.parse(localStorage.getItem('customColors'));
            const colorPickers = document.querySelectorAll('#colorPicker1, #colorPicker2, #colorPicker3');
            const customColorLabels = document.querySelectorAll('.custom-color');

            customColors.forEach((color, index) => {
                if (colorPickers[index]) {
                    colorPickers[index].value = color;
                }
                if (customColorLabels[index]) {
                    customColorLabels[index].style.backgroundColor = color;
                    customColorLabels[index].dataset.color = color;
                }
            });
        }

        // Call the initialization function on page load
        initializeLocalStorage();

        // Additional code to update world or other UI elements based on stored values
        // For example, you might want to load and display world data from local storage
        if (world && localStorage.getItem('worldData')) {
            world.deserialize(localStorage.getItem('worldData'));
            // Assume you have a function to update the world display
        }
    });

}

function serializeToBase64() {
    const data = world.serialize();
    const compressedData = pako.deflate(data, { to: 'string' });
    return encodeURIComponent(btoa(compressedData));
}

function getShareURL() {
    return `${location.origin}${location.pathname}#${serializeToBase64()}`;
}

function exportWorldQRCode() {
    if (!world) {
        console.error("World is not initialized.");
        return;
    }
    const url = getShareURL();
    QRCode.toCanvas(document.getElementById('qrCanvas'), url, function (error) {
        if (error) {
            console.error("QR Code Error: ", error);
        } else {
            console.log('QR code successfully generated!');
        }
    });
}
window.exportWorldQRCode = exportWorldQRCode;
window.getShareURL = getShareURL;




main();
