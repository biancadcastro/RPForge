# OFFLINE ORACLE ONLY (never part of the product). Blender's own FBX importer reads a file
# and reports where every bone head is, frame by frame, so the RPForge FBX reader's
# understanding of pre-rotation, rotation order, units and axes can be compared with an
# independent implementation. Run through scripts/animation-engine/fbx-reader-vs-blender.mjs:
#   blender --background --factory-startup --python blender-read-fbx.py -- <file.fbx> <out.json> <frames> <fps>
import bpy, json, sys

argv = sys.argv[sys.argv.index('--') + 1:]
path, out_path, frames, fps = argv[0], argv[1], int(argv[2]), int(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = fps
scene.render.fps_base = 1.0
bpy.ops.import_scene.fbx(filepath=path, anim_offset=0.0, ignore_leaf_bones=True, automatic_bone_orientation=False)
armatures = [o for o in scene.objects if o.type == 'ARMATURE']
result = {'armatures': len(armatures), 'frames': []}
for frame in range(frames):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    heads = {}
    for arm in armatures:
        for pb in arm.pose.bones:
            p = arm.matrix_world @ pb.head
            heads[pb.name] = [round(p.x, 7), round(p.y, 7), round(p.z, 7)]
    result['frames'].append(heads)
with open(out_path, 'w', encoding='utf-8') as handle:
    json.dump(result, handle)
print('READ_OK', bpy.app.version_string, len(armatures))
