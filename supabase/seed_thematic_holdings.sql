-- ============================================================
-- Seed 2: holdings ilustrativos para los portafolios temáticos
-- nuevos (bancos, retail, litio, semis, etc.).
-- Corre DESPUÉS de schema.sql + seed_holdings.sql.
--
-- Idempotente (on conflict do nothing). Pesos ilustrativos.
-- ============================================================

do $$
declare
  bancos_id uuid;
  retail_id uuid;
  litio_id uuid;
  divipsa_id uuid;
  renovables_id uuid;
  sp500_id uuid;
  semis_id uuid;
  bonos_id uuid;
  aristocrats_id uuid;
  fintech_id uuid;
  latintech_id uuid;
  utilities_id uuid;
begin
  select id into bancos_id from portfolios where slug = 'bancos-chilenos';
  select id into retail_id from portfolios where slug = 'retail-chileno';
  select id into litio_id from portfolios where slug = 'litio-mineria';
  select id into divipsa_id from portfolios where slug = 'dividendos-ipsa';
  select id into renovables_id from portfolios where slug = 'energias-renovables';
  select id into sp500_id from portfolios where slug = 'sp500-top10';
  select id into semis_id from portfolios where slug = 'semiconductores';
  select id into bonos_id from portfolios where slug = 'bonos-tesoro-us';
  select id into aristocrats_id from portfolios where slug = 'dividend-aristocrats';
  select id into fintech_id from portfolios where slug = 'fintech-global';
  select id into latintech_id from portfolios where slug = 'latin-tech';
  select id into utilities_id from portfolios where slug = 'utilities-defensivas';

  -- Bancos Chilenos (BCS, CLP)
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (bancos_id, 'BSANTANDER', 'Banco Santander Chile', 24.0, 23.0, 'equity', 'BCS', 'CLP', current_date),
    (bancos_id, 'CHILE', 'Banco de Chile', 20.0, 20.0, 'equity', 'BCS', 'CLP', current_date),
    (bancos_id, 'BCI', 'Banco de Crédito e Inversiones', 15.0, 15.0, 'equity', 'BCS', 'CLP', current_date),
    (bancos_id, 'ITAUCORP', 'Itaú CorpBanca', 16.0, 17.0, 'equity', 'BCS', 'CLP', current_date),
    (bancos_id, 'SECURITY', 'Banco Security', 9.0, 9.0, 'equity', 'BCS', 'CLP', current_date),
    (bancos_id, 'RIPLEY', 'Banco Ripley', 16.0, 16.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Retail Chileno
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (retail_id, 'FALABELLA', 'Falabella S.A.', 22.0, 21.0, 'equity', 'BCS', 'CLP', current_date),
    (retail_id, 'CENCOSUD', 'Cencosud S.A.', 20.0, 20.0, 'equity', 'BCS', 'CLP', current_date),
    (retail_id, 'CENCOSHOPPING', 'Cencosud Shopping', 16.0, 16.0, 'equity', 'BCS', 'CLP', current_date),
    (retail_id, 'RIPLEY', 'Ripley Corp', 15.0, 17.0, 'equity', 'BCS', 'CLP', current_date),
    (retail_id, 'MALLPLAZA', 'Mallplaza', 14.0, 14.0, 'equity', 'BCS', 'CLP', current_date),
    (retail_id, 'PARAUCO', 'Parque Arauco', 13.0, 12.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Litio y Minería
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (litio_id, 'SQM-B', 'SQM S.A.', 34.0, 30.0, 'equity', 'BCS', 'CLP', current_date),
    (litio_id, 'ALB', 'Albemarle Corp', 22.0, 22.0, 'equity', 'NYSE', 'USD', current_date),
    (litio_id, 'LTHM', 'Livent / Arcadium', 16.0, 17.0, 'equity', 'NYSE', 'USD', current_date),
    (litio_id, 'CAP', 'CAP S.A. (minería)', 16.0, 18.0, 'equity', 'BCS', 'CLP', current_date),
    (litio_id, 'PIL', 'Pilbara Minerals', 12.0, 13.0, 'equity', 'ASX', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Dividendos IPSA (CLP)
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (divipsa_id, 'ENELCHILE', 'Enel Chile', 18.0, 18.0, 'equity', 'BCS', 'CLP', current_date),
    (divipsa_id, 'AGUAS-A', 'Aguas Andinas', 15.0, 14.0, 'equity', 'BCS', 'CLP', current_date),
    (divipsa_id, 'COLBUN', 'Colbún S.A.', 15.0, 15.0, 'equity', 'BCS', 'CLP', current_date),
    (divipsa_id, 'ENELAM', 'Enel Américas', 17.0, 17.0, 'equity', 'BCS', 'CLP', current_date),
    (divipsa_id, 'CCU', 'CCU S.A.', 17.0, 18.0, 'equity', 'BCS', 'CLP', current_date),
    (divipsa_id, 'GASCO', 'Gasco S.A.', 18.0, 18.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Energías Renovables
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (renovables_id, 'NEE', 'NextEra Energy', 20.0, 19.0, 'equity', 'NYSE', 'USD', current_date),
    (renovables_id, 'ENPH', 'Enphase Energy', 15.0, 16.0, 'equity', 'NASDAQ', 'USD', current_date),
    (renovables_id, 'FSLR', 'First Solar', 16.0, 16.0, 'equity', 'NASDAQ', 'USD', current_date),
    (renovables_id, 'VWS', 'Vestas Wind Systems', 16.0, 15.0, 'equity', 'CPH', 'EUR', current_date),
    (renovables_id, 'IBDRY', 'Iberdrola S.A.', 17.0, 17.0, 'equity', 'BME', 'EUR', current_date),
    (renovables_id, 'ORSTED', 'Ørsted A/S', 16.0, 17.0, 'equity', 'CPH', 'EUR', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- S&P 500 Top 10
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (sp500_id, 'AAPL', 'Apple Inc', 14.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'MSFT', 'Microsoft Corp', 15.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'NVDA', 'NVIDIA Corp', 16.0, 13.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'AMZN', 'Amazon.com Inc', 12.0, 12.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'GOOGL', 'Alphabet Inc', 11.0, 11.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'META', 'Meta Platforms', 11.0, 11.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'BRK-B', 'Berkshire Hathaway B', 10.0, 11.0, 'equity', 'NYSE', 'USD', current_date),
    (sp500_id, 'TSLA', 'Tesla Inc', 6.0, 8.0, 'equity', 'NASDAQ', 'USD', current_date),
    (sp500_id, 'LLY', 'Eli Lilly', 5.0, 6.0, 'equity', 'NYSE', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Carrera de Semiconductores
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (semis_id, 'NVDA', 'NVIDIA Corp', 22.0, 19.0, 'equity', 'NASDAQ', 'USD', current_date),
    (semis_id, 'TSM', 'Taiwan Semiconductor', 20.0, 20.0, 'equity', 'NYSE', 'USD', current_date),
    (semis_id, 'ASML', 'ASML Holding', 16.0, 16.0, 'equity', 'NASDAQ', 'USD', current_date),
    (semis_id, 'AVGO', 'Broadcom Inc', 15.0, 15.0, 'equity', 'NASDAQ', 'USD', current_date),
    (semis_id, 'AMD', 'Advanced Micro Devices', 13.0, 13.0, 'equity', 'NASDAQ', 'USD', current_date),
    (semis_id, 'INTC', 'Intel Corp', 7.0, 9.0, 'equity', 'NASDAQ', 'USD', current_date),
    (semis_id, 'QCOM', 'Qualcomm', 7.0, 8.0, 'equity', 'NASDAQ', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Bonos del Tesoro US (renta fija)
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (bonos_id, 'UST-2Y', 'Bono Tesoro US 2 años', 22.0, 22.0, 'bond', 'OTC', 'USD', current_date),
    (bonos_id, 'UST-5Y', 'Bono Tesoro US 5 años', 22.0, 21.0, 'bond', 'OTC', 'USD', current_date),
    (bonos_id, 'UST-10Y', 'Bono Tesoro US 10 años', 26.0, 26.0, 'bond', 'OTC', 'USD', current_date),
    (bonos_id, 'UST-30Y', 'Bono Tesoro US 30 años', 20.0, 20.0, 'bond', 'OTC', 'USD', current_date),
    (bonos_id, 'TIPS', 'TIPS (bonos indexados)', 10.0, 11.0, 'bond', 'OTC', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Dividend Aristocrats
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (aristocrats_id, 'KO', 'Coca-Cola Co', 14.0, 14.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'JNJ', 'Johnson & Johnson', 14.0, 14.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'PG', 'Procter & Gamble', 14.0, 13.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'MMM', '3M Company', 10.0, 11.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'CL', 'Colgate-Palmolive', 10.0, 10.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'EMR', 'Emerson Electric', 10.0, 10.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'SWK', 'Stanley Black & Decker', 8.0, 8.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'TGT', 'Target Corp', 8.0, 8.0, 'equity', 'NYSE', 'USD', current_date),
    (aristocrats_id, 'ADP', 'Automatic Data Processing', 12.0, 12.0, 'equity', 'NASDAQ', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Fintech Global
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (fintech_id, 'V', 'Visa Inc', 20.0, 19.0, 'equity', 'NYSE', 'USD', current_date),
    (fintech_id, 'MA', 'Mastercard Inc', 20.0, 20.0, 'equity', 'NYSE', 'USD', current_date),
    (fintech_id, 'PYPL', 'PayPal Holdings', 15.0, 17.0, 'equity', 'NASDAQ', 'USD', current_date),
    (fintech_id, 'SQ', 'Block Inc (Square)', 15.0, 15.0, 'equity', 'NYSE', 'USD', current_date),
    (fintech_id, 'NU', 'Nu Holdings', 18.0, 16.0, 'equity', 'NYSE', 'USD', current_date),
    (fintech_id, 'ADYEY', 'Adyen N.V.', 12.0, 13.0, 'equity', 'AMS', 'EUR', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Latin Tech
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (latintech_id, 'MELI', 'MercadoLibre', 26.0, 24.0, 'equity', 'NASDAQ', 'USD', current_date),
    (latintech_id, 'NU', 'Nu Holdings', 22.0, 21.0, 'equity', 'NYSE', 'USD', current_date),
    (latintech_id, 'PAGS', 'PagSeguro Digital', 14.0, 15.0, 'equity', 'NYSE', 'USD', current_date),
    (latintech_id, 'STNE', 'StoneCo', 13.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (latintech_id, 'VTRU', 'Vitru (Brasil, edtech)', 13.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (latintech_id, 'DESP', 'Despegar.com', 12.0, 12.0, 'equity', 'NYSE', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Utilities Defensivas
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (utilities_id, 'NEE', 'NextEra Energy', 20.0, 20.0, 'equity', 'NYSE', 'USD', current_date),
    (utilities_id, 'DUK', 'Duke Energy', 16.0, 16.0, 'equity', 'NYSE', 'USD', current_date),
    (utilities_id, 'SO', 'Southern Company', 16.0, 15.0, 'equity', 'NYSE', 'USD', current_date),
    (utilities_id, 'D', 'Dominion Energy', 16.0, 16.0, 'equity', 'NYSE', 'USD', current_date),
    (utilities_id, 'AWK', 'American Water Works', 16.0, 16.0, 'equity', 'NYSE', 'USD', current_date),
    (utilities_id, 'ENELCHILE', 'Enel Chile', 16.0, 17.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

end $$;
