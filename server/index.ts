import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to clean text
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};

// Helper function to decode CloudFlare protected emails
const cfDecodeEmail = (encoded: string): string => {
  try {
    let email = '';
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return '';
  }
};

// Route 1: Scrape Carrier Data from SAFER
app.get('/api/scrape/carrier/:mcNumber', async (req: Request, res: Response) => {
  const { mcNumber } = req.params;
  const { useProxy } = req.query;

  try {
    const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mcNumber}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    // Check if carrier exists
    if (!$('center').length) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Helper to find value by label
    const findValueByLabel = (label: string): string => {
      let value = '';
      $('th, td').each((_, el) => {
        const text = cleanText($(el).text());
        if (text === label || text.includes(label)) {
          const nextTd = $(el).next('td');
          if (nextTd.length) {
            if (label.includes('Address')) {
              // Collect all text nodes and br-separated parts to build full address
              const parts: string[] = [];
              nextTd.contents().each((_, node) => {
                if (node.type === 'text') {
                  const t = cleanText($(node).text());
                  if (t) parts.push(t);
                } else if (node.type === 'tag' && (node as any).tagName?.toLowerCase() === 'br') {
                  // br acts as separator, already handled by collecting parts
                } else {
                  const t = cleanText($(node).text());
                  if (t) parts.push(t);
                }
              });
              // Join parts: first part is street, rest is city/state/zip
              value = parts.filter(Boolean).join(', ');
              if (!value) {
                value = cleanText(nextTd.html()?.replace(/<br\s*\/?>/gi, ', ') || '');
              }
            } else {
              value = cleanText(nextTd.text());
            }
            return false; // break
          }
        }
      });
      return value;
    };

    // Helper to find marked checkboxes
    const findMarked = (summary: string): string[] => {
      const results: string[] = [];
      $(`table[summary="${summary}"]`).find('td').each((_, el) => {
        if (cleanText($(el).text()) === 'X') {
          const next = $(el).next();
          if (next.length) {
            results.push(cleanText(next.text()));
          }
        }
      });
      return results;
    };

    const carrierData = {
      mcNumber,
      dotNumber: findValueByLabel('USDOT Number:'),
      legalName: findValueByLabel('Legal Name:'),
      dbaName: findValueByLabel('DBA Name:'),
      entityType: findValueByLabel('Entity Type:'),
      status: findValueByLabel('Operating Authority Status:'),
      phone: findValueByLabel('Phone:'),
      powerUnits: findValueByLabel('Power Units:'),
      nonCmvUnits: findValueByLabel('Non-CMV Units:'),
      drivers: findValueByLabel('Drivers:'),
      physicalAddress: findValueByLabel('Physical Address:'),
      mailingAddress: findValueByLabel('Mailing Address:'),
      dateScraped: new Date().toLocaleDateString('en-US'),
      mcs150Date: findValueByLabel('MCS-150 Form Date:'),
      mcs150Mileage: findValueByLabel('MCS-150 Mileage (Year):'),
      operationClassification: findMarked('Operation Classification'),
      carrierOperation: findMarked('Carrier Operation'),
      cargoCarried: findMarked('Cargo Carried'),
      outOfServiceDate: findValueByLabel('Out of Service Date:'),
      stateCarrierId: findValueByLabel('State Carrier ID Number:'),
      dunsNumber: findValueByLabel('DUNS Number:'),
      email: '',
    };

    // Fetch email if DOT number exists
    if (carrierData.dotNumber) {
      try {
        const emailUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${carrierData.dotNumber}/CarrierRegistration.aspx`;
        const emailResponse = await axios.get(emailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        });

        const $email = cheerio.load(emailResponse.data);
        $email('label').each((_, el) => {
          if ($email(el).text().includes('Email:')) {
            const parent = $email(el).parent();
            const cfEmail = parent.find('[data-cfemail]');
            if (cfEmail.length) {
              carrierData.email = cfDecodeEmail(cfEmail.attr('data-cfemail') || '');
            } else {
              const text = cleanText(parent.text().replace('Email:', ''));
              if (text && text.includes('@')) {
                carrierData.email = text;
              }
            }
            return false;
          }
        });
      } catch (emailError) {
        console.error('Email fetch error:', emailError);
      }
    }

    res.json(carrierData);
  } catch (error: any) {
    console.error('Carrier scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape carrier data', details: error.message });
  }
});

// Route 2: Scrape Safety Data from FMCSA SMS
app.get('/api/scrape/safety/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/CompleteProfile.aspx`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // 1. Safety Rating
    const ratingEl = $('#Rating');
    const rating = ratingEl.length ? cleanText(ratingEl.text()) : 'N/A';
    
    const ratingDateEl = $('#RatingDate');
    let ratingDate = 'N/A';
    if (ratingDateEl.length) {
      ratingDate = cleanText(ratingDateEl.text())
        .replace('Rating Date:', '')
        .replace('(', '')
        .replace(')', '')
        .trim();
    }

    // 2. BASIC Scores
    const categories = [
      'Unsafe Driving',
      'Crash Indicator',
      'HOS Compliance',
      'Vehicle Maintenance',
      'Controlled Substances',
      'Hazmat Compliance',
      'Driver Fitness'
    ];
    
    const basicScores: Array<{ category: string; measure: string }> = [];
    const sumDataRow = $('tr.sumData');
    
    if (sumDataRow.length) {
      sumDataRow.find('td').each((i, el) => {
        const valSpan = $(el).find('span.val');
        const val = valSpan.length ? cleanText(valSpan.text()) : cleanText($(el).text());
        if (categories[i]) {
          basicScores.push({
            category: categories[i],
            measure: val || '0'
          });
        }
      });
    }

    // 3. Out of Service Rates
    const oosRates: Array<{ type: string; rate: string; nationalAvg: string }> = [];
    const safetyDiv = $('#SafetyRating');
    
    if (safetyDiv.length) {
      const oosTable = safetyDiv.find('table').first();
      if (oosTable.length) {
        oosTable.find('tbody tr').each((_, row) => {
          const cols = $(row).find('th, td');
          if (cols.length >= 3) {
            oosRates.push({
              type: cleanText($(cols[0]).text()),
              rate: cleanText($(cols[1]).text()),
              nationalAvg: cleanText($(cols[2]).text())
            });
          }
        });
      }
    }

    res.json({
      rating,
      ratingDate,
      basicScores,
      oosRates
    });
  } catch (error: any) {
    console.error('Safety scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape safety data', details: error.message });
  }
});

// Route 3: Scrape Insurance Data
app.get('/api/scrape/insurance/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://searchcarriers.com/company/${dotNumber}/insurances`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const rawData = response.data?.data || (Array.isArray(response.data) ? response.data : []);
    const policies: any[] = [];

    if (Array.isArray(rawData)) {
      rawData.forEach((p: any) => {
        const carrier = p.name_company || p.insurance_company || p.insurance_company_name || p.company_name || 'NOT SPECIFIED';
        const policyNumber = p.policy_no || p.policy_number || p.pol_num || 'N/A';
        const effectiveDate = p.effective_date ? p.effective_date.split(' ')[0] : 'N/A';

        let coverage = p.max_cov_amount || p.coverage_to || p.coverage_amount || 'N/A';
        if (coverage !== 'N/A' && !isNaN(Number(coverage))) {
          const num = Number(coverage);
          if (num < 10000 && num > 0) {
            coverage = `$${(num * 1000).toLocaleString()}`;
          } else {
            coverage = `$${num.toLocaleString()}`;
          }
        }

        let type = (p.ins_type_code || 'N/A').toString();
        if (type === '1') type = 'BI&PD';
        else if (type === '2') type = 'CARGO';
        else if (type === '3') type = 'BOND';

        let iClass = (p.ins_class_code || 'N/A').toString().toUpperCase();
        if (iClass === 'P') iClass = 'PRIMARY';
        else if (iClass === 'E') iClass = 'EXCESS';

        policies.push({
          dot: dotNumber,
          carrier: carrier.toString().toUpperCase(),
          policyNumber: policyNumber.toString().toUpperCase(),
          effectiveDate,
          coverageAmount: coverage.toString(),
          type: type.toUpperCase(),
          class: iClass
        });
      });
    }

    res.json({ policies, raw: response.data });
  } catch (error: any) {
    console.error('Insurance scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape insurance data', details: error.message });
  }
});

// Route 4: Scrape FMCSA Register Data
app.get('/api/fmcsa-register', async (req: Request, res: Response) => {
  try {
    // First, we need to get the register page which shows the last 5 days
    const registerUrl = 'https://li-public.fmcsa.dot.gov/LIVIEW/PKG_register.prc_reg_detail';
    
    const response = await axios.get(registerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const entries: Array<{ number: string; title: string; decided: string; category: string }> = [];
    
    // Find all category sections
    const categoryHeaders = [
      'NAME CHANGE',
      'CERTIFICATE, PERMIT, LICENSE',
      'CERTIFICATE OF REGISTRATION',
      'DISMISSAL',
      'WITHDRAWAL',
      'REVOCATION',
      'MISCELLANEOUS',
      'TRANSFERS',
      'GRANT DECISION NOTICES'
    ];

    // Parse the HTML structure - the register uses tables with specific patterns
    $('table').each((_, table) => {
      const $table = $(table);
      
      // Look for tables that contain register entries
      $table.find('tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length >= 3) {
          const number = cleanText($(cells[0]).text());
          const title = cleanText($(cells[1]).text());
          const decided = cleanText($(cells[2]).text());
          
          // Determine category by looking at preceding headers
          let category = 'MISCELLANEOUS';
          const precedingText = $row.prevAll().text();
          
          for (const cat of categoryHeaders) {
            if (precedingText.includes(cat)) {
              category = cat;
              break;
            }
          }
          
          // Validate that this looks like a valid entry
          if (number && (number.includes('MC-') || number.includes('FF-') || number.includes('MX-')) && title && decided) {
            entries.push({
              number,
              title,
              decided,
              category
            });
          }
        }
      });
    });

    // Alternative parsing method - look for specific patterns in the HTML
    if (entries.length === 0) {
      let currentCategory = 'MISCELLANEOUS';
      
      $('body').find('*').each((_, elem) => {
        const text = $(elem).text().trim();
        
        // Check if this is a category header
        for (const cat of categoryHeaders) {
          if (text === cat) {
            currentCategory = cat;
            return;
          }
        }
        
        // Look for table rows with Number, Title, Decided pattern
        if ($(elem).is('tr')) {
          const cells = $(elem).find('td');
          if (cells.length >= 3) {
            const number = cleanText($(cells[0]).text());
            const title = cleanText($(cells[1]).text());
            const decided = cleanText($(cells[2]).text());
            
            if (number && (number.includes('MC-') || number.includes('FF-') || number.includes('MX-')) && title) {
              entries.push({
                number,
                title,
                decided: decided || 'N/A',
                category: currentCategory
              });
            }
          }
        }
      });
    }

    // If still no entries found, try a more aggressive approach
    if (entries.length === 0) {
      const bodyText = $('body').text();
      const lines = bodyText.split('\n');
      let currentCategory = 'MISCELLANEOUS';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for category headers
        for (const cat of categoryHeaders) {
          if (line.includes(cat)) {
            currentCategory = cat;
            break;
          }
        }
        
        // Look for MC/FF numbers
        const mcMatch = line.match(/(MC-\d+|FF-\d+|MX-\d+)/);
        if (mcMatch) {
          const number = mcMatch[1];
          // Try to extract title and date from the same or next lines
          const titleMatch = line.match(/(?:MC-\d+|FF-\d+|MX-\d+)\s+(.+?)(?:\d{2}\/\d{2}\/\d{4}|$)/);
          const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
          
          if (titleMatch) {
            entries.push({
              number,
              title: titleMatch[1].trim(),
              decided: dateMatch ? dateMatch[1] : 'N/A',
              category: currentCategory
            });
          }
        }
      }
    }

    // Remove duplicates
    const uniqueEntries = entries.filter((entry, index, self) =>
      index === self.findIndex((e) => e.number === entry.number && e.title === entry.title)
    );

    res.json({
      success: true,
      count: uniqueEntries.length,
      lastUpdated: new Date().toISOString(),
      entries: uniqueEntries
    });

  } catch (error: any) {
    console.error('FMCSA Register scrape error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to scrape FMCSA register data', 
      details: error.message,
      entries: []
    });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FMCSA Scraper Backend is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   - GET /api/scrape/carrier/:mcNumber`);
  console.log(`   - GET /api/scrape/safety/:dotNumber`);
  console.log(`   - GET /api/scrape/insurance/:dotNumber`);
  console.log(`   - GET /api/fmcsa-register`);
});
