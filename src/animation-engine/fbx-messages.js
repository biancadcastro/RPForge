// User-facing texts (pt-BR) for the FBX import. The `code` is the stable contract for
// programs; the text is for the person reviewing the conversion and may be reworded.
// level: 'info' (nothing to do), 'warning' (result may differ from what was expected).
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const WARNINGS = {
  FBX_MULTIPLE_TAKES: ['info', d => `O arquivo tem ${d.count} animações. Foi usada "${d.used}". Para converter outra, escolha pelo nome.`],
  FBX_RESAMPLED: ['info', d => `A animação estava em ${d.sourceFps} quadros por segundo e foi convertida para ${d.fps}, o padrão usado nas animações do jogo.`],
  FBX_DURATION_ROUNDED: ['info', d => `A duração foi ajustada de ${d.sourceDuration.toFixed(3)} s para ${d.duration.toFixed(3)} s para fechar em quadros inteiros.`],
  FBX_STATIC_POSE: ['warning', () => 'O arquivo só tem uma pose, sem movimento. O resultado é uma pose parada.'],
  FBX_REST_FROM_DEFAULTS: ['warning', () => 'O arquivo não traz a pose de referência do personagem (a pose em que ele foi montado). Foi usada a pose inicial do arquivo. Se a animação sair torta, exporte o FBX junto com o personagem (com a malha/skin).'],
  FBX_UNMAPPED_BONES: ['info', d => `${plural(d.count, 'osso do arquivo não tem', 'ossos do arquivo não têm')} correspondente no personagem do jogo e ${d.count === 1 ? 'foi ignorado' : 'foram ignorados'}.`],
  FBX_FEW_BONES_MAPPED: ['warning', d => `Só ${plural(d.count, 'osso foi reconhecido', 'ossos foram reconhecidos')}. A animação pode ficar incompleta. Confira os nomes dos ossos ou informe a correspondência manualmente.`],
  FBX_DUPLICATE_BONE_MATCH: ['warning', d => `${plural(d.count, 'osso do arquivo aponta', 'ossos do arquivo apontam')} para um osso do jogo que já estava em uso e ${d.count === 1 ? 'foi ignorado' : 'foram ignorados'}.`],
  FBX_NO_HIPS: ['warning', () => 'O quadril não foi reconhecido. O personagem não vai subir, descer nem se deslocar; só as rotações foram convertidas.'],
  FBX_ORIENTATION_ASSUMED: ['warning', () => 'Não foi possível conferir para que lado o personagem está virado. Foi usada a orientação declarada no arquivo. Se a animação sair virada, confira os ossos das pernas ou dos braços.'],
  FBX_REST_NOT_AXIS_ALIGNED: ['warning', d => `O personagem não está de frente na pose de referência (desvio de ${d.degrees.toFixed(0)}°). A direção da animação pode sair um pouco girada.`],
  FBX_SCALE_FROM_UNITS: ['info', () => 'O tamanho do personagem foi calculado pela unidade declarada no arquivo, porque as pernas não foram reconhecidas.'],
  FBX_REST_POSE_ALIGNED: ['info', d => `A pose de referência do arquivo é diferente da do personagem do jogo. ${plural(d.count, 'osso foi ajustado', 'ossos foram ajustados')} para compensar (até ${d.maxDegrees.toFixed(0)}°). Mãos e pés podem precisar de conferência no jogo.`],
  FBX_SPARSE_CUBIC_KEYS: ['warning', () => 'A animação usa curvas suaves com poucos pontos. O RPForge calcula essas curvas por conta própria e o movimento pode diferir um pouco do programa de origem. Para um resultado idêntico, exporte o FBX com a opção de gravar todos os quadros (bake animation).'],
  FBX_TCB_AS_LINEAR: ['warning', () => 'Parte das curvas usa um tipo de suavização que o RPForge não reproduz. Esses trechos foram convertidos em linha reta entre os pontos. Para evitar isso, exporte o FBX com a opção de gravar todos os quadros (bake animation).'],
  FBX_SCALE_ANIMATION_IGNORED: ['warning', d => `${plural(d.count, 'osso muda', 'ossos mudam')} de tamanho durante a animação. O jogo não recebe essa mudança de tamanho.`],
  FBX_BONE_TRANSLATION_IGNORED: ['info', d => `${plural(d.count, 'osso se desloca', 'ossos se deslocam')} em relação ao corpo (estica ou encolhe). Só o deslocamento do quadril é levado para o jogo; os demais ossos só giram.`],
  FBX_PRE_ROTATION_INACTIVE: ['info', d => `${plural(d.count, 'osso traz', 'ossos trazem')} uma rotação de base marcada como desativada no arquivo; ela foi ignorada, como o formato determina.`],
  FBX_ROOT_MOTION_MOVER: ['info', d => `O deslocamento do personagem pelo chão (${d.distance.toFixed(2)} m) foi gravado separado, para o jogo mover o personagem de verdade.`],
  FBX_ROOT_TRAVEL: ['info', d => `O personagem se afasta ${d.distance.toFixed(2)} m do ponto inicial durante a animação. No jogo ele volta ao ponto inicial quando a animação termina.`],
  CLIP_NAME_ADJUSTED: ['info', d => `O nome da animação foi ajustado para "${d.name}" (o jogo só aceita letras minúsculas, números, "_", "-" e "@").`],
};

export function warning(code, details = {}) {
  const entry = WARNINGS[code];
  if (!entry) throw new Error(`Unknown warning ${code}`);
  return {code, level: entry[0], message: entry[1](details), details};
}
export const WARNING_CODES = Object.freeze(Object.keys(WARNINGS));

const FEATURES = {
  layers: 'A animação usa mais de uma camada. Junte as camadas em uma só (bake) no programa de origem e exporte de novo.',
  mirroredTransform: 'O personagem está espelhado (escala negativa) no arquivo. Aplique a escala no programa de origem e exporte de novo.',
  rotationOrder: 'O arquivo usa uma ordem de rotação que o RPForge não reconhece.',
};
const ERRORS = {
  INVALID_INPUT: () => 'Os dados enviados para a conversão são inválidos.',
  INPUT_TOO_LARGE: d => `O arquivo é grande demais${d?.limit ? ` (limite de ${Math.floor(d.limit / (1024 * 1024))} MB)` : ''}. Exporte só o esqueleto e a animação, sem texturas embutidas.`,
  FBX_INVALID: () => 'Este arquivo não é um FBX válido ou está danificado. Exporte de novo no programa de origem.',
  FBX_UNSUPPORTED_VERSION: d => `Este FBX é de uma versão que o RPForge não lê${d?.version ? ` (${(d.version / 1000).toFixed(1)})` : ''}. Exporte como FBX 2011 ou mais novo (binário, versão 7.x).`,
  FBX_UNSUPPORTED_FEATURE: d => FEATURES[d?.feature] ?? 'O arquivo usa um recurso que o RPForge não converte.',
  FBX_NO_SKELETON: () => 'O arquivo não tem esqueleto. Exporte o FBX com os ossos do personagem.',
  FBX_NO_ANIMATION: () => 'O arquivo não tem animação nos ossos. Exporte o FBX com a animação incluída.',
  FBX_TAKE_NOT_FOUND: d => `A animação escolhida não existe no arquivo.${d?.available?.length ? ` Disponíveis: ${d.available.join(', ')}.` : ''}`,
  BONE_MAP_INVALID: () => 'A correspondência manual de ossos cita um osso que não existe no arquivo ou no personagem do jogo.',
  BONE_MAP_INSUFFICIENT: () => 'Nenhum osso do arquivo foi reconhecido. O esqueleto precisa usar nomes conhecidos (GTA, Mixamo, Unreal ou Biped), ou informe a correspondência manualmente.',
  ANIMATION_TOO_LONG: d => `A animação é longa demais: ${d?.frames ?? '?'} quadros (${d?.seconds?.toFixed?.(1) ?? '?'} s). O limite é ${d?.max ?? 1800} quadros (${d?.maxSeconds?.toFixed?.(0) ?? 60} s). Divida a animação em partes menores.`,
  LIMIT_EXCEEDED: () => 'O arquivo passa dos limites de segurança do RPForge (quantidade de dados). Exporte só o esqueleto e a animação.',
  DECOMPRESSION_FAILED: () => 'O arquivo está danificado (dados compactados inválidos). Exporte de novo no programa de origem.',
  NONFINITE_VALUE: () => 'O arquivo tem valores inválidos na animação. Exporte de novo no programa de origem.',
  CYCLE: () => 'A hierarquia de ossos do arquivo está corrompida. Exporte de novo no programa de origem.',
  SKELETON_INVALID: () => 'O esqueleto de destino informado é inválido.',
  OUTPUT_TOO_LARGE: () => 'A animação convertida ficou grande demais para um arquivo do jogo. Reduza a duração.',
  CANCELLED: () => 'Conversão cancelada.',
  INTERNAL: () => 'O RPForge encontrou um erro inesperado ao converter este arquivo.',
};

/** Plain-language pt-BR text for a failure ({code, details}). */
export function describeError(error) {
  return (ERRORS[error?.code] ?? ERRORS.INTERNAL)(error?.details);
}
