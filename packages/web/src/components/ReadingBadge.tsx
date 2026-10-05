import { MeterReading } from '../types';
import { READING_TYPE_LABEL } from '../format';

/** 读数类型小徽标：颜色 + 文字，不只靠颜色区分 */
export function ReadingBadge({ reading }: { reading: MeterReading }) {
  const estimated = reading.readingType === 'ESTIMATED';
  return (
    <span className={`badge ${estimated ? 'tone-warning' : 'tone-info'}`}>
      {estimated ? '◐' : '●'} {READING_TYPE_LABEL[reading.readingType]}
      {reading.source === 'ONSITE' ? '·现场' : ''}
    </span>
  );
}
