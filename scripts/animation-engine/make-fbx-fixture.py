# OFFLINE FIXTURE GENERATOR ONLY. Blender (GPL) is never part of the product and is never
# run by it; this script uses Blender as an independent FBX writer and as an oracle for
# the poses it wrote, so the RPForge FBX import can be checked against something that is
# not RPForge. Run through scripts/animation-engine/fbx-interop.mjs:
#   blender --background --factory-startup --python make-fbx-fixture.py -- <skeleton.json> <out dir>
#
# skeleton.json (written by fbx-interop.mjs from the bundled reference skeleton):
#   {"bones": [{"name", "parent" (index or -1), "head": [x,y,z], "x": [..], "y": [..], "z": [..]}]}
# head and axes are the bone's rest position and rest axes in the game's model space
# (metres, Z up, character facing +Y, left side at -X).
#
# Outputs in <out dir>:
#   freemode-actions.fbx   Y up, with a small skinned mesh (so a bind pose is written), three takes
#   freemode-zup.fbx       Z up / Y forward, armature only (no bind pose), same three takes
#   oracle.json            for every take and frame: bone head positions and world rotation
#                          relative to rest, as evaluated by Blender itself
import bpy, json, math, sys
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
skeleton_path, out_dir = argv[0], argv[1]
with open(skeleton_path, 'r', encoding='utf-8') as handle:
    skeleton = json.load(handle)
bones = skeleton['bones']
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.render.fps_base = 1.0
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# --- armature in the game's model space --------------------------------------------------
arm_data = bpy.data.armatures.new('freemode')
arm = bpy.data.objects.new('freemode', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
edit = []
for b in bones:
    eb = arm_data.edit_bones.new(b['name'])
    eb.head = (0, 0, 0)
    eb.tail = (0, 0.04, 0)
    # Blender bones run along their local Y. The game bone runs along its local X, so the
    # Blender axes are (game Z, game X, game Y): a different local frame on purpose.
    gx, gy, gz = Vector(b['x']), Vector(b['y']), Vector(b['z'])
    m = Matrix((
        (gz.x, gx.x, gy.x, b['head'][0]),
        (gz.y, gx.y, gy.y, b['head'][1]),
        (gz.z, gx.z, gy.z, b['head'][2]),
        (0, 0, 0, 1)))
    eb.matrix = m
    if b['parent'] >= 0:
        eb.parent = edit[b['parent']]
        eb.use_connect = False
    edit.append(eb)
bpy.ops.object.mode_set(mode='OBJECT')
rest = {b['name']: arm_data.bones[b['name']].matrix_local.copy() for b in bones}

# --- animations, described as rotations about world axes at rest -------------------------
def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def basis_rotation(name, axis, degrees):
    # Rotation about a model-space axis (taken at rest), expressed in the bone's own rest frame.
    r0 = rest[name].to_3x3()
    world = Matrix.Rotation(math.radians(degrees), 3, Vector(axis))
    return (r0.inverted() @ world @ r0).to_quaternion()

def arm_raise(frame, total):
    # Right arm goes from the rest pose up above the shoulder, holds, comes back.
    t = frame / total
    s = ease(t / 0.4) if t < 0.4 else (1.0 if t < 0.6 else ease((1 - t) / 0.4))
    return {'SKEL_R_UpperArm': ((0, 1, 0), -115 * s)}, (0, 0, 0)

def torso_twist(frame, total):
    # Chest turns to the character's left, then to the right, and returns.
    angle = 45 * math.sin(2 * math.pi * frame / total)
    return {name: ((0, 0, 1), angle / 3) for name in ('SKEL_Spine0', 'SKEL_Spine1', 'SKEL_Spine2')}, (0, 0, 0)

def march(frame, total):
    # Left knee up in the first half, right knee up in the second half; the body rises slightly.
    t = frame / total
    left = math.sin(math.pi * min(t, 0.5) / 0.5) ** 2 if t < 0.5 else 0.0
    right = math.sin(math.pi * (t - 0.5) / 0.5) ** 2 if t >= 0.5 else 0.0
    pose = {
        'SKEL_L_Thigh': ((1, 0, 0), 65 * left), 'SKEL_L_Calf': ((1, 0, 0), -80 * left),
        'SKEL_R_Thigh': ((1, 0, 0), 65 * right), 'SKEL_R_Calf': ((1, 0, 0), -80 * right),
    }
    return pose, (0, 0, 0.05 * (left + right))

ACTIONS = [('braco_direito_levanta', arm_raise, 75), ('giro_tronco', torso_twist, 60), ('passo_no_lugar', march, 60)]

ANIMATED = sorted({name for _, pose_at, total in ACTIONS for name in pose_at(1, total)[0].keys()})
arm.animation_data_create()
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
root_name = bones[0]['name']
actions = []
for name, pose_at, total in ACTIONS:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data.action = action
    for frame in range(total + 1):
        pose, offset = pose_at(frame, total)
        # Every action keys every bone any action moves: Blender bakes whatever pose is left
        # on an unkeyed bone into the take, so nothing may be left over from another action.
        for bone_name in ANIMATED:
            axis, degrees = pose.get(bone_name, ((1, 0, 0), 0.0))
            pb = arm.pose.bones[bone_name]
            pb.rotation_quaternion = basis_rotation(bone_name, axis, degrees)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        root = arm.pose.bones[root_name]
        root.location = rest[root_name].to_3x3().inverted() @ Vector(offset)
        root.keyframe_insert('location', frame=frame)
    for pb in arm.pose.bones:  # back to rest before the next action is authored
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    actions.append((name, action, total))

# --- oracle: what Blender itself evaluates for each frame --------------------------------
oracle = {'fps': FPS, 'takes': []}
for name, action, total in actions:
    arm.animation_data.action = action
    frames = []
    for frame in range(total + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        positions, deltas = [], []
        for b in bones:
            pm = arm.pose.bones[b['name']].matrix
            d = pm.to_3x3() @ rest[b['name']].to_3x3().inverted()
            positions.append([round(v, 7) for v in pm.translation])
            deltas.append([round(d[r][c], 7) for r in range(3) for c in range(3)])
        frames.append({'positions': positions, 'deltas': deltas})
    oracle['takes'].append({'name': name, 'frames': frames})
oracle['bones'] = [b['name'] for b in bones]
with open(out_dir + '/oracle.json', 'w', encoding='utf-8') as handle:
    json.dump(oracle, handle)

# --- a tiny skinned mesh, so the exporter writes a bind pose -------------------------------
mesh = bpy.data.meshes.new('skin')
mesh.from_pydata([(0, 0, 0), (0.1, 0, 0), (0, 0, 0.1)], [], [(0, 1, 2)])
skin = bpy.data.objects.new('skin', mesh)
scene.collection.objects.link(skin)
for b in bones:
    skin.vertex_groups.new(name=b['name']).add([0, 1, 2], 1.0 / len(bones), 'REPLACE')
skin.parent = arm
modifier = skin.modifiers.new('Armature', 'ARMATURE')
modifier.object = arm

def export(path, with_mesh, frame, **axes):
    arm.animation_data.action = actions[0][1]
    scene.frame_set(frame)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    skin.select_set(with_mesh)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={'ARMATURE', 'MESH'} if with_mesh else {'ARMATURE'},
        add_leaf_bones=False, bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True, bake_anim_simplify_factor=0.0, **axes)

# Exported while the pose is NOT the rest pose (frame 30 of the arm raise): the bind pose must win.
export(out_dir + '/freemode-actions.fbx', True, 30)
# Armature only, exported at a rest frame: no bind pose in the file, the default pose is the rest.
export(out_dir + '/freemode-zup.fbx', False, 0, axis_forward='Y', axis_up='Z')
print('FIXTURE_OK', bpy.app.version_string)
