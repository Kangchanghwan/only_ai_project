import theme from './theme.js'
import core from './core.js'
import docxFonts from './docxFonts.js'
import pptxFonts from './pptxFonts.js'
import docxSettings from './docxSettings.js'
import docxDocDefaults from './docxDocDefaults.js'
import docxBorders from './docxBorders.js'
import docxStyleBorders from './docxStyleBorders.js'
import docxSdt from './docxSdt.js'
import xlsxDefaultFont from './xlsxDefaultFont.js'
import xlsxNotes from './xlsxNotes.js'
import xlsxDefinedNames from './xlsxDefinedNames.js'
import xlsxSheetAttrs from './xlsxSheetAttrs.js'
import pptxTableLines from './pptxTableLines.js'
import pptxSections from './pptxSections.js'

/** Every rule, in the order they run. */
export const RULES = [
  theme, core,
  docxFonts, docxSettings, docxDocDefaults, docxBorders, docxStyleBorders, docxSdt,
  xlsxDefaultFont, xlsxNotes, xlsxDefinedNames, xlsxSheetAttrs,
  pptxFonts, pptxTableLines, pptxSections,
]
