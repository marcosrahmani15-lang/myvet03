import {
  analyzeSMSContent,
  GSM7_BASIC_CHARACTERS,
  GSM7_EXTENDED_CHARACTERS,
  type SMSSegmentationResult,
} from '../../shared/utils/smsSegmentation.ts';

export type ClientSmsCalcResult = SMSSegmentationResult;

export function calculateClientSmsSegments(text: string): SMSSegmentationResult {
  return analyzeSMSContent(text);
}

export { GSM7_BASIC_CHARACTERS, GSM7_EXTENDED_CHARACTERS };
