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
                            0xffaa00, 0xffff00, 0x00ff00, 0x00ffff, 0x0055ff,
                            0x0000ff, 0xff00ff
                        ];
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
        return JSON.stringify({ cellSize: this.cellSize, cells });
    }

    deserialize(data) {
        const parsed = JSON.parse(data);
        this.cellSize = parsed.cellSize;
        this.cells = parsed.cells.reduce((acc, { key, value }) => {
            acc[key] = new Uint8Array(value);
            return acc;
        }, {});
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



async function setupARButton(renderer, scene, camera) {
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test']
    });
    document.body.appendChild(arButton);

    renderer.xr.addEventListener('sessionstart', async () => {
        const session = renderer.xr.getSession();

        const reticle = new Reticle();
        scene.add(reticle);
        let cubePlaced = false;  // Flag to check if a cube has been placed

        // Prepare reference spaces for hit testing
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
                        // Only display reticle if no cube has been placed
                        reticle.visible = !cubePlaced;
                        reticle.matrix.fromArray(pose.transform.matrix);
                    }
                } else {
                    reticle.visible = false;
                }
            }
            renderer.render(scene, camera);
        });

        session.addEventListener('select', () => {
            if (reticle.visible && !cubePlaced) {
                // Create a cube and add it where the reticle is
                const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1); // Size of the cube
                const material = new THREE.MeshStandardMaterial({color: 0x00FF00}); // Color of the cube
                const cube = new THREE.Mesh(geometry, material);
                cube.position.setFromMatrixPosition(reticle.matrix);
                scene.add(cube);

                // Update flag and hide the reticle
                cubePlaced = true;
                reticle.visible = false;
            }
        });
    });

    renderer.xr.addEventListener('sessionend', () => {
        renderer.setAnimationLoop(null);
    });
}




let world;

function main() {

    const canvas = document.querySelector('#c');
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas,
        alpha: true
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

    const scene = new THREE.Scene();
    scene.background = null;


    function addLight(x, y, z) {

        const color = 0xFFFFFF;
        const intensity = 2;
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(x, y, z);
        scene.add(light);

    }

    addLight(-1, 2, 4);
    addLight(1, -1, -2);

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

    function initializeWorld() {
        if (location.hash) {
            const hashData = location.hash.substring(1); // remove '#'
            try {
                const compressedData = atob(decodeURIComponent(hashData));
                const data = pako.inflate(compressedData, { to: 'string' });
                world.deserialize(data);
                Object.keys(world.cells).forEach(cellId => {
                    const [x, y, z] = cellId.split(',').map(Number);
                    updateCellGeometry(x * world.cellSize, y * world.cellSize, z * world.cellSize);
                });
                console.log("World loaded from URL hash.");
                return;
            } catch (e) {
                console.error("Failed to load world from hash", e);
            }
        }

        // Default initialization if no hash data or on error
        for (let z = 0; z < cellSize; ++z) {
            for (let x = 0; x < cellSize; ++x) {
                world.setVoxel(x, 0, z, 1);
            }
        }
        updateVoxelGeometry(1, 1, 1);
    }

    initializeWorld();

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

        elem.addEventListener('click', allowUncheck);

    });

    function allowUncheck() {

        if (this.id === currentId) {

            this.checked = false;
            currentId = undefined;
            currentVoxel = -1;

        } else {

            currentId = this.id;
            currentVoxel = parseInt(this.value);

        }

    }

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
            // the intersection point is on the face. That means
            // the math imprecision could put us on either side of the face.
            // so go half a normal into the voxel if removing (currentVoxel = 0)
            // our out of the voxel if adding (currentVoxel  > 0)
            const pos = intersection.position.map((v, ndx) => {

                return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);

            });
            world.setVoxel(...pos, voxelId);
            updateVoxelGeometry(...pos);
            requestRenderIfNotRequested();

        }

    }

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
}

function exportWorldToBase64() {
    if (!world) {
        console.error("World is not initialized.");
        return;
    }
    const data = world.serialize();
    const compressedData = pako.deflate(data, { to: 'string' });
    const encodedData = encodeURIComponent(btoa(compressedData));
    const url = `${location.origin}${location.pathname}#${encodedData}`;
    QRCode.toCanvas(document.getElementById('qrCanvas'), url, function (error) {
        if (error) {
            console.error("QR Code Error: ", error);
        } else {
            console.log('QR code successfully generated!');
            // Show the modal
            document.getElementById('qrModal').style.display = 'block';
        }
    });
}
window.exportWorldToBase64 = exportWorldToBase64;

// Add close functionality to modal
document.querySelector('.close').addEventListener('click', function () {
    document.getElementById('qrModal').style.display = 'none';
});

// Close modal if outside click
window.onclick = function (event) {
    if (event.target == document.getElementById('qrModal')) {
        document.getElementById('qrModal').style.display = 'none';
    }
}



main();
