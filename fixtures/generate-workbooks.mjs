/**
 * Generate realistic .xlsx workbooks for XLent testing.
 * Run: node fixtures/generate-workbooks.mjs
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const outDir = path.join(import.meta.dirname, 'workbooks');
fs.mkdirSync(outDir, { recursive: true });

function writeFormula(ws, ref, formula) {
  ws[ref] = { t: 'n', f: formula, v: 0 };
}

function buildSheet(headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: j });
      if (cell && typeof cell === 'object' && 'f' in cell) {
        ws[ref] = { t: 'n', f: cell.f, v: 0 };
      } else if (typeof cell === 'number') {
        ws[ref] = { t: 'n', v: cell };
      } else if (cell != null) {
        ws[ref] = { t: 's', v: String(cell) };
      }
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } });
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEMICONDUCTOR WAFER ECONOMICS (Sil-focused — will be pushed)
// ─────────────────────────────────────────────────────────────────────────────
function waferEconomics() {
  const wb = XLSX.utils.book_new();

  const inputs = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Wafer Cost', 18500, 'USD'],
    ['Die Area', 78, 'mm²'],
    ['Wafer Diameter', 300, 'mm'],
    ['Defect Density', 0.25, 'd/cm²'],
    ['Packaging Cost', 52, 'USD'],
    ['Test Cost', 14, 'USD'],
    ['Assembly Cost', 28, 'USD'],
    ['Volume', 250000, 'units'],
    ['ASP', 89, 'USD'],
    ['Scrap Rate', 0.03, '%'],
    ['NRE Amortization', 4500000, 'USD'],
    ['Yield Learning Rate', 0.92, ''],
  ]);
  XLSX.utils.book_append_sheet(wb, inputs, 'Assumptions');

  const calcs = buildSheet(['Metric', 'Value'], [
    ['Wafer Area', { f: 'PI()*(Assumptions!B4/2)^2' }],
    ['Gross DPW', { f: 'FLOOR(Economics!B2/Assumptions!B3, 1)' }],
    ['Yield', { f: '(1-Assumptions!B5)^(Assumptions!B3/100)*Assumptions!B13' }],
    ['Net DPW', { f: 'Economics!B3*Economics!B4' }],
    ['Die Cost', { f: 'Assumptions!B2/Economics!B5' }],
    ['Total Unit Cost', { f: 'Economics!B6+Assumptions!B6+Assumptions!B7+Assumptions!B8' }],
    ['Effective Unit Cost', { f: 'Economics!B7*(1+Assumptions!B11)' }],
    ['NRE Per Unit', { f: 'Assumptions!B12/Assumptions!B9' }],
    ['Fully Loaded Cost', { f: 'Economics!B8+Economics!B9' }],
    ['Revenue', { f: 'Assumptions!B9*Assumptions!B10' }],
    ['COGS', { f: 'Assumptions!B9*Economics!B10' }],
    ['Gross Profit', { f: 'Economics!B11-Economics!B12' }],
    ['Gross Margin', { f: 'Economics!B13/Economics!B11' }],
    ['Contribution Margin', { f: '(Assumptions!B10-Economics!B10)/Assumptions!B10' }],
    ['Breakeven Volume', { f: 'Assumptions!B12/(Assumptions!B10-Economics!B10)' }],
  ]);
  XLSX.utils.book_append_sheet(wb, calcs, 'Economics');

  return { wb, name: 'wafer-economics.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADVANCED NODE TRANSITION (Sil-focused — process node migration model)
// ─────────────────────────────────────────────────────────────────────────────
function nodeTransition() {
  const wb = XLSX.utils.book_new();

  const params = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Current Node', 7, 'nm'],
    ['Target Node', 3, 'nm'],
    ['Mask Set Cost Current', 15000000, 'USD'],
    ['Mask Set Cost Target', 48000000, 'USD'],
    ['Wafer Cost Current', 12000, 'USD'],
    ['Wafer Cost Target', 18500, 'USD'],
    ['Die Area Current', 120, 'mm²'],
    ['Die Shrink Factor', 0.55, ''],
    ['Yield Current', 0.88, ''],
    ['Yield Target Initial', 0.62, ''],
    ['Yield Ramp Months', 18, 'months'],
    ['Yield Mature', 0.84, ''],
    ['Performance Gain', 1.35, 'x'],
    ['Power Reduction', 0.60, 'x'],
    ['Annual Volume', 500000, 'units'],
    ['ASP Premium', 1.20, 'x'],
    ['Current ASP', 145, 'USD'],
    ['Capital Investment', 250000000, 'USD'],
  ]);
  XLSX.utils.book_append_sheet(wb, params, 'Parameters');

  const analysis = buildSheet(['Metric', 'Value'], [
    ['Die Area Target', { f: 'Parameters!B8*Parameters!B9' }],
    ['DPW Current', { f: 'FLOOR(PI()*(300/2)^2/Parameters!B8, 1)' }],
    ['DPW Target', { f: 'FLOOR(PI()*(300/2)^2/Analysis!B2, 1)' }],
    ['Net DPW Current', { f: 'Analysis!B3*Parameters!B10' }],
    ['Net DPW Target Mature', { f: 'Analysis!B4*Parameters!B13' }],
    ['Cost Per Die Current', { f: 'Parameters!B6/Analysis!B5' }],
    ['Cost Per Die Target', { f: 'Parameters!B7/Analysis!B6' }],
    ['Cost Delta Per Die', { f: 'Analysis!B8-Analysis!B7' }],
    ['New ASP', { f: 'Parameters!B18*Parameters!B17' }],
    ['Revenue Uplift Per Unit', { f: 'Analysis!B10-Parameters!B18' }],
    ['Annual Revenue Delta', { f: 'Analysis!B11*Parameters!B16' }],
    ['Annual Cost Delta', { f: 'Analysis!B9*Parameters!B16' }],
    ['Net Annual Benefit', { f: 'Analysis!B12-Analysis!B13' }],
    ['Payback Months', { f: '(Parameters!B19+Parameters!B5)/Analysis!B14*12' }],
    ['ROI 3yr', { f: '(Analysis!B14*3-Parameters!B19-Parameters!B5)/(Parameters!B19+Parameters!B5)' }],
    ['Transistor Density Gain', { f: '1/Parameters!B9' }],
  ]);
  XLSX.utils.book_append_sheet(wb, analysis, 'Analysis');

  return { wb, name: 'node-transition-3nm.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FOUNDRY CAPACITY PLANNING (Sil-focused — supply chain)
// ─────────────────────────────────────────────────────────────────────────────
function foundryCapacity() {
  const wb = XLSX.utils.book_new();

  const inputs = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Total Wafer Starts', 85000, 'wpm'],
    ['N3 Allocation', 0.15, '%'],
    ['N5 Allocation', 0.30, '%'],
    ['N7 Allocation', 0.25, '%'],
    ['Mature Node Allocation', 0.30, '%'],
    ['Avg Cycle Time N3', 75, 'days'],
    ['Avg Cycle Time N5', 60, 'days'],
    ['Avg Cycle Time N7', 52, 'days'],
    ['Equipment Utilization', 0.92, '%'],
    ['Planned Downtime', 0.05, '%'],
    ['Unplanned Downtime', 0.03, '%'],
    ['Yield N3', 0.68, ''],
    ['Yield N5', 0.85, ''],
    ['Yield N7', 0.91, ''],
    ['Wafer Price N3', 20000, 'USD'],
    ['Wafer Price N5', 16000, 'USD'],
    ['Wafer Price N7', 12000, 'USD'],
    ['Expansion CapEx', 3200000000, 'USD'],
    ['Expansion Capacity', 20000, 'wpm'],
  ]);
  XLSX.utils.book_append_sheet(wb, inputs, 'Inputs');

  const model = buildSheet(['Metric', 'Value'], [
    ['Effective Utilization', { f: 'Inputs!B10*(1-Inputs!B11-Inputs!B12)' }],
    ['Effective Wafer Starts', { f: 'Inputs!B2*Capacity!B2' }],
    ['N3 Wafer Starts', { f: 'Capacity!B3*Inputs!B3' }],
    ['N5 Wafer Starts', { f: 'Capacity!B3*Inputs!B4' }],
    ['N7 Wafer Starts', { f: 'Capacity!B3*Inputs!B5' }],
    ['Mature Wafer Starts', { f: 'Capacity!B3*Inputs!B6' }],
    ['N3 Good Wafers Out', { f: 'Capacity!B4*Inputs!B13' }],
    ['N5 Good Wafers Out', { f: 'Capacity!B5*Inputs!B14' }],
    ['N7 Good Wafers Out', { f: 'Capacity!B6*Inputs!B15' }],
    ['Monthly Revenue N3', { f: 'Capacity!B8*Inputs!B16' }],
    ['Monthly Revenue N5', { f: 'Capacity!B9*Inputs!B17' }],
    ['Monthly Revenue N7', { f: 'Capacity!B10*Inputs!B18' }],
    ['Total Monthly Revenue', { f: 'Capacity!B11+Capacity!B12+Capacity!B13' }],
    ['Annual Revenue', { f: 'Capacity!B14*12' }],
    ['Revenue Per Wafer Start', { f: 'Capacity!B14/Capacity!B3' }],
    ['Expansion ROI Period', { f: 'Inputs!B19/(Inputs!B20*Capacity!B16*12)' }],
    ['Blended Yield', { f: '(Capacity!B8+Capacity!B9+Capacity!B10)/(Capacity!B4+Capacity!B5+Capacity!B6)' }],
  ]);
  XLSX.utils.book_append_sheet(wb, model, 'Capacity');

  return { wb, name: 'foundry-capacity-plan.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SaaS UNIT ECONOMICS (Non-Sil — startup metrics)
// ─────────────────────────────────────────────────────────────────────────────
function saasUnitEconomics() {
  const wb = XLSX.utils.book_new();

  const inputs = buildSheet(['Metric', 'Value', 'Unit'], [
    ['Monthly Subscribers', 12400, ''],
    ['MRR', 496000, 'USD'],
    ['ARPU', 40, 'USD'],
    ['Gross Churn Rate', 0.045, '%/mo'],
    ['Expansion Revenue Rate', 0.025, '%/mo'],
    ['CAC', 380, 'USD'],
    ['Payback Sales Cycle', 45, 'days'],
    ['Gross Margin', 0.78, ''],
    ['S&M Spend Monthly', 280000, 'USD'],
    ['R&D Spend Monthly', 180000, 'USD'],
    ['G&A Spend Monthly', 95000, 'USD'],
    ['Avg Contract Length', 14, 'months'],
    ['Support Cost Per User', 4.50, 'USD'],
    ['Infrastructure Per User', 3.20, 'USD'],
  ]);
  XLSX.utils.book_append_sheet(wb, inputs, 'Metrics');

  const unit = buildSheet(['KPI', 'Value'], [
    ['Net Revenue Retention', { f: '1-Metrics!B5+Metrics!B6' }],
    ['LTV Gross', { f: 'Metrics!B4/(Metrics!B5-Metrics!B6)' }],
    ['LTV Net', { f: 'Unit!B3*Metrics!B9' }],
    ['LTV:CAC Ratio', { f: 'Unit!B4/Metrics!B7' }],
    ['CAC Payback Months', { f: 'Metrics!B7/(Metrics!B4*Metrics!B9)' }],
    ['Net Churn', { f: 'Metrics!B5-Metrics!B6' }],
    ['ARR', { f: 'Metrics!B3*12' }],
    ['Variable Cost Per User', { f: 'Metrics!B14+Metrics!B15' }],
    ['Contribution Margin Per User', { f: 'Metrics!B4-Unit!B9' }],
    ['Monthly Burn', { f: 'Metrics!B10+Metrics!B11+Metrics!B12+(Metrics!B2*Unit!B9)' }],
    ['Monthly Gross Profit', { f: 'Metrics!B3*Metrics!B9' }],
    ['Operating Margin', { f: '(Unit!B12-Unit!B11)/Metrics!B3' }],
    ['Rule of 40', { f: 'Unit!B13+(Metrics!B6-Metrics!B5)*12' }],
    ['Magic Number', { f: '(Metrics!B3-Metrics!B3/(1+Metrics!B6-Metrics!B5))*12/Metrics!B10' }],
  ]);
  XLSX.utils.book_append_sheet(wb, unit, 'Unit');

  return { wb, name: 'saas-unit-economics.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REAL ESTATE DEVELOPMENT PRO FORMA (Non-Sil — property finance)
// ─────────────────────────────────────────────────────────────────────────────
function realEstateDev() {
  const wb = XLSX.utils.book_new();

  const assumptions = buildSheet(['Item', 'Value', 'Unit'], [
    ['Land Cost', 8500000, 'USD'],
    ['Hard Costs', 42000000, 'USD'],
    ['Soft Costs Pct', 0.18, '%'],
    ['Total Units', 280, ''],
    ['Avg Unit Size', 1050, 'sqft'],
    ['Rent Per SqFt', 4.25, 'USD/mo'],
    ['Vacancy Rate', 0.06, ''],
    ['OpEx Ratio', 0.35, ''],
    ['Cap Rate Market', 0.048, ''],
    ['Exit Cap Rate', 0.052, ''],
    ['Hold Period', 5, 'years'],
    ['LTV', 0.65, ''],
    ['Interest Rate', 0.058, ''],
    ['Loan Term', 30, 'years'],
    ['Rent Growth Annual', 0.03, ''],
    ['Construction Duration', 24, 'months'],
  ]);
  XLSX.utils.book_append_sheet(wb, assumptions, 'Assumptions');

  const proforma = buildSheet(['Line Item', 'Value'], [
    ['Soft Costs', { f: 'Assumptions!B3*Assumptions!B4' }],
    ['Total Development Cost', { f: 'Assumptions!B2+Assumptions!B3+ProForma!B2' }],
    ['Gross Rentable Area', { f: 'Assumptions!B5*Assumptions!B6' }],
    ['Potential Gross Income', { f: 'ProForma!B4*Assumptions!B7*12' }],
    ['Effective Gross Income', { f: 'ProForma!B5*(1-Assumptions!B8)' }],
    ['NOI', { f: 'ProForma!B6*(1-Assumptions!B9)' }],
    ['Stabilized Value', { f: 'ProForma!B7/Assumptions!B10' }],
    ['Loan Amount', { f: 'ProForma!B3*Assumptions!B13' }],
    ['Annual Debt Service', { f: 'PMT(Assumptions!B14/12, Assumptions!B15*12, -ProForma!B9)*12' }],
    ['DSCR', { f: 'ProForma!B7/ProForma!B10' }],
    ['Cash on Cash Year 1', { f: '(ProForma!B7-ProForma!B10)/(ProForma!B3-ProForma!B9)' }],
    ['Exit NOI', { f: 'ProForma!B7*(1+Assumptions!B16)^Assumptions!B12' }],
    ['Exit Value', { f: 'ProForma!B13/Assumptions!B11' }],
    ['Profit on Cost', { f: '(ProForma!B8-ProForma!B3)/ProForma!B3' }],
    ['Equity Multiple', { f: 'ProForma!B14/((ProForma!B3-ProForma!B9))' }],
    ['Unlevered IRR Proxy', { f: '(ProForma!B7/ProForma!B3)+Assumptions!B16' }],
  ]);
  XLSX.utils.book_append_sheet(wb, proforma, 'ProForma');

  return { wb, name: 'multifamily-proforma.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUPPLY CHAIN CHIP SHORTAGE (Sil-focused — allocation + pricing)
// ─────────────────────────────────────────────────────────────────────────────
function chipShortage() {
  const wb = XLSX.utils.book_new();

  const market = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Demand Units Q1', 4200000, ''],
    ['Demand Units Q2', 4800000, ''],
    ['Demand Units Q3', 5100000, ''],
    ['Demand Units Q4', 5500000, ''],
    ['Supply Capacity Q1', 3800000, ''],
    ['Supply Capacity Q2', 4100000, ''],
    ['Supply Capacity Q3', 4500000, ''],
    ['Supply Capacity Q4', 4900000, ''],
    ['Base ASP', 72, 'USD'],
    ['Shortage Premium Factor', 1.25, 'x'],
    ['Inventory Carry Cost', 0.02, '%/mo'],
    ['Expedite Fee', 8.50, 'USD/unit'],
    ['Dual Source Premium', 0.12, '%'],
    ['Safety Stock Weeks', 6, ''],
    ['Lead Time Weeks', 14, ''],
  ]);
  XLSX.utils.book_append_sheet(wb, market, 'Market');

  const impact = buildSheet(['Metric', 'Value'], [
    ['Annual Demand', { f: 'Market!B2+Market!B3+Market!B4+Market!B5' }],
    ['Annual Supply', { f: 'Market!B6+Market!B7+Market!B8+Market!B9' }],
    ['Supply Gap', { f: 'Impact!B2-Impact!B3' }],
    ['Gap Percent', { f: 'Impact!B4/Impact!B2' }],
    ['Shortage ASP', { f: 'Market!B10*Market!B11' }],
    ['Revenue at Base', { f: 'Impact!B3*Market!B10' }],
    ['Revenue at Premium', { f: 'Impact!B3*Impact!B6' }],
    ['Revenue Uplift', { f: 'Impact!B8-Impact!B7' }],
    ['Lost Revenue', { f: 'Impact!B4*Market!B10' }],
    ['Net Revenue Impact', { f: 'Impact!B9-Impact!B10' }],
    ['Safety Stock Units', { f: '(Impact!B2/52)*Market!B15' }],
    ['Carry Cost Annual', { f: 'Impact!B12*Market!B10*Market!B12*12' }],
    ['Expedite Budget', { f: 'Impact!B4*0.3*Market!B13' }],
    ['Dual Source Cost', { f: 'Impact!B3*0.2*Market!B10*Market!B14' }],
    ['Total Mitigation Cost', { f: 'Impact!B13+Impact!B14+Impact!B15' }],
  ]);
  XLSX.utils.book_append_sheet(wb, impact, 'Impact');

  return { wb, name: 'chip-shortage-impact.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MANUFACTURING YIELD RAMP (Sil-focused — learning curve)
// ─────────────────────────────────────────────────────────────────────────────
function yieldRamp() {
  const wb = XLSX.utils.book_new();

  const config = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Initial Yield', 0.42, ''],
    ['Mature Yield', 0.89, ''],
    ['Learning Rate', 0.85, ''],
    ['Wafer Cost', 18500, 'USD'],
    ['Die Area', 95, 'mm²'],
    ['Monthly Volume Target', 40000, 'wafers'],
    ['Ramp Start Month', 1, ''],
    ['Full Production Month', 18, ''],
    ['Defect Density Initial', 0.8, 'd/cm²'],
    ['Defect Density Mature', 0.15, 'd/cm²'],
    ['Excursion Rate', 0.02, '%'],
    ['Rework Cost', 4200, 'USD/lot'],
    ['Lot Size', 25, 'wafers'],
    ['Test Escape Rate', 0.001, ''],
    ['Field Failure Cost', 850, 'USD/unit'],
  ]);
  XLSX.utils.book_append_sheet(wb, config, 'Config');

  const ramp = buildSheet(['Metric', 'Value'], [
    ['DPW', { f: 'FLOOR(PI()*(300/2)^2/Config!B6, 1)' }],
    ['Good Die Initial', { f: 'Ramp!B2*Config!B2' }],
    ['Good Die Mature', { f: 'Ramp!B2*Config!B3' }],
    ['Yield Improvement', { f: 'Config!B3-Config!B2' }],
    ['Cost Per Good Die Initial', { f: 'Config!B5/(Ramp!B2*Config!B2)' }],
    ['Cost Per Good Die Mature', { f: 'Config!B5/(Ramp!B2*Config!B3)' }],
    ['Cost Reduction Per Die', { f: 'Ramp!B6-Ramp!B7' }],
    ['Monthly Waste Initial', { f: 'Config!B7*(1-Config!B2)*Config!B5' }],
    ['Monthly Waste Mature', { f: 'Config!B7*(1-Config!B3)*Config!B5' }],
    ['Monthly Savings at Maturity', { f: 'Ramp!B9-Ramp!B10' }],
    ['Excursion Lots Monthly', { f: '(Config!B7/Config!B14)*Config!B12' }],
    ['Rework Cost Monthly', { f: 'Ramp!B12*Config!B13' }],
    ['Test Escapes Monthly', { f: 'Config!B7*Ramp!B2*Config!B3*Config!B15' }],
    ['Field Failure Liability', { f: 'Ramp!B14*Config!B16' }],
    ['Total Quality Cost', { f: 'Ramp!B13+Ramp!B15' }],
    ['Cumulative Learning Doublings', { f: 'LN(Config!B9)/LN(2)' }],
  ]);
  XLSX.utils.book_append_sheet(wb, ramp, 'Ramp');

  return { wb, name: 'yield-ramp-model.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. STARTUP FUNDRAISE MODEL (Non-Sil — venture math)
// ─────────────────────────────────────────────────────────────────────────────
function fundraiseModel() {
  const wb = XLSX.utils.book_new();

  const terms = buildSheet(['Item', 'Value', 'Unit'], [
    ['Pre-Money Valuation', 25000000, 'USD'],
    ['Round Size', 8000000, 'USD'],
    ['Option Pool Expansion', 0.10, '%'],
    ['Existing Shares', 10000000, ''],
    ['Founder Shares', 6000000, ''],
    ['Current Monthly Burn', 420000, 'USD'],
    ['Revenue Monthly', 180000, 'USD'],
    ['Revenue Growth MoM', 0.12, '%'],
    ['Months to Next Round', 18, ''],
    ['Target Next Round ARR', 5000000, 'USD'],
    ['Expected Next Valuation', 80000000, 'USD'],
    ['Liquidation Preference', 1, 'x'],
  ]);
  XLSX.utils.book_append_sheet(wb, terms, 'Terms');

  const cap = buildSheet(['Metric', 'Value'], [
    ['Post-Money Valuation', { f: 'Terms!B2+Terms!B3' }],
    ['New Shares Issued', { f: 'Terms!B5*(Terms!B3/Terms!B2)' }],
    ['Pool Shares', { f: '(Terms!B5+Cap!B3)*Terms!B4/(1-Terms!B4)-(Terms!B5-Terms!B6)' }],
    ['Total Shares Post', { f: 'Terms!B5+Cap!B3+Cap!B4' }],
    ['Price Per Share', { f: 'Cap!B2/Cap!B5' }],
    ['Founder Ownership Post', { f: 'Terms!B6/Cap!B5' }],
    ['Investor Ownership', { f: 'Cap!B3/Cap!B5' }],
    ['Runway Months', { f: 'Terms!B3/(Terms!B7-Terms!B8)' }],
    ['Revenue at Next Round', { f: 'Terms!B8*(1+Terms!B9)^Terms!B10' }],
    ['ARR at Next Round', { f: 'Cap!B10*12' }],
    ['ARR Multiple Next', { f: 'Terms!B12/Cap!B11' }],
    ['Investor Return Multiple', { f: '(Cap!B8*Terms!B12)/Terms!B3' }],
    ['Dilution This Round', { f: 'Terms!B3/Cap!B2' }],
    ['Cumulative Dilution', { f: '1-Terms!B6/Cap!B5' }],
  ]);
  XLSX.utils.book_append_sheet(wb, cap, 'Cap');

  return { wb, name: 'series-a-cap-table.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ENERGY STORAGE LEVELIZED COST (Non-Sil — cleantech)
// ─────────────────────────────────────────────────────────────────────────────
function energyStorage() {
  const wb = XLSX.utils.book_new();

  const params = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Battery Capacity', 100, 'MWh'],
    ['Power Rating', 25, 'MW'],
    ['Installed Cost per kWh', 285, 'USD/kWh'],
    ['BOS Cost per kW', 180, 'USD/kW'],
    ['Annual Degradation', 0.025, '%/yr'],
    ['Round Trip Efficiency', 0.87, ''],
    ['Cycles Per Year', 365, ''],
    ['Project Life', 20, 'years'],
    ['Discount Rate', 0.08, ''],
    ['O&M Fixed Annual', 12.50, 'USD/kW-yr'],
    ['O&M Variable', 0.003, 'USD/kWh'],
    ['Augmentation Cost', 0.15, 'x of initial'],
    ['Augmentation Year', 10, ''],
    ['Revenue per MWh Discharged', 95, 'USD/MWh'],
    ['Capacity Payment Annual', 45000, 'USD/MW-yr'],
  ]);
  XLSX.utils.book_append_sheet(wb, params, 'Parameters');

  const lcos = buildSheet(['Metric', 'Value'], [
    ['Total CapEx', { f: 'Parameters!B2*1000*Parameters!B4+Parameters!B3*1000*Parameters!B5' }],
    ['Annual Energy Throughput', { f: 'Parameters!B2*Parameters!B8*Parameters!B7' }],
    ['Lifetime Energy', { f: 'LCOS!B3*Parameters!B9' }],
    ['Avg Degraded Capacity', { f: 'Parameters!B2*(1-Parameters!B6*Parameters!B9/2)' }],
    ['Effective Annual Energy', { f: 'LCOS!B5*Parameters!B8*Parameters!B7' }],
    ['Fixed O&M Annual', { f: 'Parameters!B3*1000*Parameters!B11' }],
    ['Variable O&M Annual', { f: 'LCOS!B6*1000*Parameters!B12' }],
    ['Augmentation NPV', { f: 'Parameters!B2*1000*Parameters!B4*Parameters!B13/(1+Parameters!B10)^Parameters!B14' }],
    ['Total Lifetime Cost NPV', { f: 'LCOS!B2+(LCOS!B7+LCOS!B8)*((1-(1+Parameters!B10)^(-Parameters!B9))/Parameters!B10)+LCOS!B9' }],
    ['LCOS', { f: 'LCOS!B10/(LCOS!B6*Parameters!B9*1000)' }],
    ['Annual Energy Revenue', { f: 'LCOS!B6*Parameters!B15' }],
    ['Annual Capacity Revenue', { f: 'Parameters!B3*Parameters!B16' }],
    ['Total Annual Revenue', { f: 'LCOS!B12+LCOS!B13' }],
    ['Simple Payback', { f: 'LCOS!B2/LCOS!B14' }],
    ['NPV 20yr', { f: '-LCOS!B2+LCOS!B14*((1-(1+Parameters!B10)^(-Parameters!B9))/Parameters!B10)' }],
  ]);
  XLSX.utils.book_append_sheet(wb, lcos, 'LCOS');

  return { wb, name: 'battery-storage-lcos.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. PACKAGING COST COMPARISON (Sil-focused — advanced packaging)
// ─────────────────────────────────────────────────────────────────────────────
function packagingComparison() {
  const wb = XLSX.utils.book_new();

  const specs = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Die Count', 4, ''],
    ['Interposer Area', 1200, 'mm²'],
    ['Substrate Layers', 12, ''],
    ['TSV Count', 45000, ''],
    ['Bump Pitch', 45, 'um'],
    ['CoWoS Unit Cost', 2800, 'USD'],
    ['EMIB Unit Cost', 1950, 'USD'],
    ['Fan-Out Unit Cost', 680, 'USD'],
    ['Standard Flip Chip Cost', 85, 'USD'],
    ['CoWoS Yield', 0.72, ''],
    ['EMIB Yield', 0.81, ''],
    ['Fan-Out Yield', 0.88, ''],
    ['Volume Annual', 180000, 'units'],
    ['Performance Factor CoWoS', 1.45, 'x'],
    ['Performance Factor EMIB', 1.32, 'x'],
    ['Performance Factor FO', 1.18, 'x'],
    ['ASP Premium High Perf', 1.60, 'x'],
    ['Base Package ASP', 420, 'USD'],
  ]);
  XLSX.utils.book_append_sheet(wb, specs, 'Specs');

  const compare = buildSheet(['Metric', 'Value'], [
    ['Effective Cost CoWoS', { f: 'Specs!B7/Specs!B11' }],
    ['Effective Cost EMIB', { f: 'Specs!B8/Specs!B12' }],
    ['Effective Cost Fan-Out', { f: 'Specs!B9/Specs!B13' }],
    ['Cost Premium CoWoS vs FC', { f: '(Compare!B2-Specs!B10)/Specs!B10' }],
    ['Cost Premium EMIB vs FC', { f: '(Compare!B3-Specs!B10)/Specs!B10' }],
    ['Revenue CoWoS', { f: 'Specs!B14*Specs!B19*Specs!B15*Specs!B18' }],
    ['Revenue EMIB', { f: 'Specs!B14*Specs!B19*Specs!B16*Specs!B18' }],
    ['Revenue Fan-Out', { f: 'Specs!B14*Specs!B19*Specs!B17*Specs!B18' }],
    ['Margin CoWoS', { f: '(Compare!B7-Specs!B14*Compare!B2)/Compare!B7' }],
    ['Margin EMIB', { f: '(Compare!B8-Specs!B14*Compare!B3)/Compare!B8' }],
    ['Margin Fan-Out', { f: '(Compare!B9-Specs!B14*Compare!B4)/Compare!B9' }],
    ['Best ROI Package', { f: 'MAX(Compare!B10, Compare!B11, Compare!B12)' }],
    ['Annual CoWoS Investment', { f: 'Specs!B14*Compare!B2' }],
    ['Annual EMIB Investment', { f: 'Specs!B14*Compare!B3' }],
    ['Perf per Dollar CoWoS', { f: 'Specs!B15/Compare!B2' }],
    ['Perf per Dollar EMIB', { f: 'Specs!B16/Compare!B3' }],
  ]);
  XLSX.utils.book_append_sheet(wb, compare, 'Compare');

  return { wb, name: 'packaging-cost-comparison.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. PROJECT CASH FLOWS — NO NPV/IRR (Derived-metric test case)
// Demonstrates: workbook has raw data but NOT the derived metric.
// XLent should compute NPV/IRR on request using computeDerived().
// ─────────────────────────────────────────────────────────────────────────────
function projectCashFlows() {
  const wb = XLSX.utils.book_new();

  const assumptions = buildSheet(['Parameter', 'Value', 'Unit'], [
    ['Discount Rate', 0.10, ''],
    ['Initial Investment', 2500000, 'USD'],
    ['Project Duration', 5, 'years'],
    ['Revenue Growth Rate', 0.08, ''],
    ['Operating Margin', 0.35, ''],
    ['Terminal Multiple', 4.5, 'x'],
    ['Tax Rate', 0.21, ''],
    ['CapEx Year 2', 400000, 'USD'],
  ]);
  XLSX.utils.book_append_sheet(wb, assumptions, 'Assumptions');

  // Cash flows sheet has yearly projections — formulas compute cash flows
  // but there is NO NPV, IRR, or payback formula anywhere
  const flows = buildSheet(['Year', 'Revenue', 'COGS', 'EBITDA', 'Tax', 'Net CF'], [
    [0, 0, 0, { f: '-Assumptions!B3' }, 0, { f: '-Assumptions!B3' }],
    [1, 800000, { f: 'CashFlows!B3*(1-Assumptions!B6)' }, { f: 'CashFlows!B3-CashFlows!C3' }, { f: 'CashFlows!D3*Assumptions!B8' }, { f: 'CashFlows!D3-CashFlows!E3' }],
    [2, { f: 'CashFlows!B3*(1+Assumptions!B5)' }, { f: 'CashFlows!B4*(1-Assumptions!B6)' }, { f: 'CashFlows!B4-CashFlows!C4-Assumptions!B9' }, { f: 'MAX(CashFlows!D4,0)*Assumptions!B8' }, { f: 'CashFlows!D4-CashFlows!E4' }],
    [3, { f: 'CashFlows!B4*(1+Assumptions!B5)' }, { f: 'CashFlows!B5*(1-Assumptions!B6)' }, { f: 'CashFlows!B5-CashFlows!C5' }, { f: 'CashFlows!D5*Assumptions!B8' }, { f: 'CashFlows!D5-CashFlows!E5' }],
    [4, { f: 'CashFlows!B5*(1+Assumptions!B5)' }, { f: 'CashFlows!B6*(1-Assumptions!B6)' }, { f: 'CashFlows!B6-CashFlows!C6' }, { f: 'CashFlows!D6*Assumptions!B8' }, { f: 'CashFlows!D6-CashFlows!E6' }],
    [5, { f: 'CashFlows!B6*(1+Assumptions!B5)' }, { f: 'CashFlows!B7*(1-Assumptions!B6)' }, { f: 'CashFlows!B7-CashFlows!C7' }, { f: 'CashFlows!D7*Assumptions!B8' }, { f: 'CashFlows!D7-CashFlows!E7+CashFlows!D7*Assumptions!B7' }],
  ]);
  XLSX.utils.book_append_sheet(wb, flows, 'CashFlows');

  // Summary has totals but still no NPV/IRR
  const summary = buildSheet(['Metric', 'Value'], [
    ['Total Revenue', { f: 'SUM(CashFlows!B2:CashFlows!B7)' }],
    ['Total Net CF', { f: 'SUM(CashFlows!F2:CashFlows!F7)' }],
    ['Peak Negative CF', { f: 'MIN(CashFlows!F2:CashFlows!F7)' }],
    ['Final Year CF', { f: 'CashFlows!F7' }],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  return { wb, name: 'project-cashflows-no-npv.xlsx' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate all workbooks
// ─────────────────────────────────────────────────────────────────────────────
const generators = [
  waferEconomics,        // Sil
  nodeTransition,        // Sil
  foundryCapacity,       // Sil
  chipShortage,          // Sil
  yieldRamp,             // Sil
  packagingComparison,   // Sil
  projectCashFlows,      // Derived-metric test case
  saasUnitEconomics,     // Non-Sil
  realEstateDev,         // Non-Sil
  fundraiseModel,        // Non-Sil
  energyStorage,         // Non-Sil
];

console.log('Generating workbooks...\n');
for (const gen of generators) {
  const { wb, name } = gen();
  const outPath = path.join(outDir, name);
  XLSX.writeFile(wb, outPath);
  console.log(`  ✓ ${name}`);
}
console.log(`\nDone — ${generators.length} workbooks in ${outDir}`);
