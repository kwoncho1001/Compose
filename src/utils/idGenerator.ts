/**
 * 경로와 해시를 조합해 항상 일정한 ID를 생성합니다.
 * 코드가 변하지 않는 한 ID도 변하지 않아 중복 생성을 방지합니다.
 */
export const generateDeterministicId = (filePath: string, logicHash: string): string => {
  // btoa는 브라우저 환경에서 사용 가능하며, Node 환경에서는 Buffer.from().toString('base64')를 사용해야 할 수 있습니다.
  // 여기서는 클라이언트 사이드 실행을 가정합니다.
  const pathPart = btoa(filePath).substring(0, 8);
  const hashPart = logicHash.replace('LOGIC_', '');
  return `ref_${pathPart}_${hashPart}`;
};
