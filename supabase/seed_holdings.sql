-- ============================================================
-- Seed: realistic holdings so portfolios look alive from day 1.
-- Run AFTER schema.sql (which creates the portfolio rows).
--
-- These are ILLUSTRATIVE weights based on public reporting patterns.
-- Real data comes from the scrapers once connected.
-- ============================================================

-- Helper: resolve portfolio id by slug
do $$
declare
  pelosi_id uuid;
  trump_id uuid;
  r4m_id uuid;
  r4ma_id uuid;
  lv_id uuid;
  btg_id uuid;
  aiw_id uuid;
  claude_id uuid;
begin
  select id into pelosi_id from portfolios where slug = 'pelosi-tracker';
  select id into trump_id from portfolios where slug = 'trump-trades';
  select id into r4m_id from portfolios where slug = 'renta4-moderada';
  select id into r4ma_id from portfolios where slug = 'renta4-moderada-ampliada';
  select id into lv_id from portfolios where slug = 'larrainvial-top-picks';
  select id into btg_id from portfolios where slug = 'btg-insights';
  select id into aiw_id from portfolios where slug = 'ai-world-war';
  select id into claude_id from portfolios where slug = 'claude-portfolio';

  -- ---- Pelosi Tracker (illustrative tech-heavy pattern) ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (pelosi_id, 'NVDA', 'NVIDIA Corp', 18.5, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'AAPL', 'Apple Inc', 15.0, 16.5, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'MSFT', 'Microsoft Corp', 14.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'GOOGL', 'Alphabet Inc', 12.0, 10.5, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'AMZN', 'Amazon.com Inc', 10.5, 11.0, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'TSLA', 'Tesla Inc', 9.0, 12.0, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'CRM', 'Salesforce Inc', 8.0, 7.0, 'equity', 'NYSE', 'USD', current_date),
    (pelosi_id, 'PANW', 'Palo Alto Networks', 7.0, 5.5, 'equity', 'NASDAQ', 'USD', current_date),
    (pelosi_id, 'DIS', 'Walt Disney Co', 6.0, 9.5, 'equity', 'NYSE', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- Trump Trades (energy/finance pattern) ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (trump_id, 'DJT', 'Trump Media & Technology', 22.0, 25.0, 'equity', 'NASDAQ', 'USD', current_date),
    (trump_id, 'XOM', 'Exxon Mobil Corp', 16.0, 14.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'CVX', 'Chevron Corp', 14.0, 13.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'JPM', 'JPMorgan Chase', 13.0, 12.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'BAC', 'Bank of America', 11.0, 11.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'DAL', 'Delta Air Lines', 9.0, 10.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'LMT', 'Lockheed Martin', 8.0, 7.0, 'equity', 'NYSE', 'USD', current_date),
    (trump_id, 'PLTR', 'Palantir Technologies', 7.0, 8.0, 'equity', 'NASDAQ', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- Renta 4 Moderada (Chile, IPSA names) ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (r4m_id, 'COPEC', 'Empresas Copec', 16.0, 15.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'SQM-B', 'SQM S.A.', 14.0, 15.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'FALABELLA', 'Falabella S.A.', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'CENCOSUD', 'Cencosud S.A.', 11.0, 10.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'BSANTANDER', 'Banco Santander Chile', 13.0, 13.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'CMPC', 'CMPC S.A.', 10.0, 9.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'ENELAM', 'Enel Américas', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'CCU', 'CCU S.A.', 7.0, 8.0, 'equity', 'BCS', 'CLP', current_date),
    (r4m_id, 'RENTA4', 'Renta 4 Corredores', 5.0, 6.0, 'fund', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- Renta 4 Moderada Ampliada ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (r4ma_id, 'COPEC', 'Empresas Copec', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'SQM-B', 'SQM S.A.', 11.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'FALABELLA', 'Falabella S.A.', 10.0, 10.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'CENCOSUD', 'Cencosud S.A.', 9.0, 9.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'BSANTANDER', 'Banco Santander Chile', 10.0, 10.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'CMPC', 'CMPC S.A.', 8.0, 8.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'ENELAM', 'Enel Américas', 9.0, 9.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'CCU', 'CCU S.A.', 6.0, 6.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'ITAUCORP', 'Itaú CorpBanca', 8.0, 8.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'PARAUCO', 'Parque Arauco', 7.0, 7.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'AGUAS-A', 'Aguas Andinas', 6.0, 6.0, 'equity', 'BCS', 'CLP', current_date),
    (r4ma_id, 'GASCO', 'Gasco S.A.', 4.0, 3.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- LarrainVial Top Picks ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (lv_id, 'COPEC', 'Empresas Copec', 18.0, 16.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'BSANTANDER', 'Banco Santander Chile', 16.0, 16.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'FALABELLA', 'Falabella S.A.', 14.0, 13.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'SQM-B', 'SQM S.A.', 13.0, 14.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'ENELAM', 'Enel Américas', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'CENCOSHOPPING', 'Cencosud Shopping', 10.0, 10.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'CMPC', 'CMPC S.A.', 9.0, 9.0, 'equity', 'BCS', 'CLP', current_date),
    (lv_id, 'RIPLEY', 'Ripley Corp', 8.0, 10.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- BTG Pactual Insights ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (btg_id, 'BSANTANDER', 'Banco Santander Chile', 20.0, 19.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'COPEC', 'Empresas Copec', 17.0, 17.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'SQM-B', 'SQM S.A.', 15.0, 16.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'CMPC', 'CMPC S.A.', 13.0, 13.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'ENELAM', 'Enel Américas', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'FALABELLA', 'Falabella S.A.', 11.0, 11.0, 'equity', 'BCS', 'CLP', current_date),
    (btg_id, 'ITAUCORP', 'Itaú CorpBanca', 12.0, 12.0, 'equity', 'BCS', 'CLP', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- AI World War III (thematic: semis + cloud + energy) ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (aiw_id, 'NVDA', 'NVIDIA Corp', 20.0, 17.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'TSM', 'Taiwan Semiconductor', 15.0, 15.0, 'equity', 'NYSE', 'USD', current_date),
    (aiw_id, 'AMD', 'Advanced Micro Devices', 12.0, 11.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'AVGO', 'Broadcom Inc', 12.0, 12.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'MSFT', 'Microsoft Corp', 13.0, 13.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'GOOGL', 'Alphabet Inc', 11.0, 12.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'ASML', 'ASML Holding', 9.0, 9.0, 'equity', 'NASDAQ', 'USD', current_date),
    (aiw_id, 'VST', 'Vistra Corp (energy for AI DCs)', 8.0, 11.0, 'equity', 'NYSE', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- ---- Claude Portfolio (Anthropic ecosystem: premium, Pro) ----
  insert into holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of) values
    (claude_id, 'GOOGL', 'Alphabet Inc (Anthropic backer)', 18.0, 18.0, 'equity', 'NASDAQ', 'USD', current_date),
    (claude_id, 'AMZN', 'Amazon.com (AWS/Anthropic partner)', 16.0, 15.0, 'equity', 'NASDAQ', 'USD', current_date),
    (claude_id, 'MSFT', 'Microsoft Corp (AI infra)', 14.0, 14.0, 'equity', 'NASDAQ', 'USD', current_date),
    (claude_id, 'NVDA', 'NVIDIA Corp (compute)', 15.0, 15.0, 'equity', 'NASDAQ', 'USD', current_date),
    (claude_id, 'TSM', 'Taiwan Semiconductor', 11.0, 11.0, 'equity', 'NYSE', 'USD', current_date),
    (claude_id, 'ORCL', 'Oracle Corp (OCI)', 10.0, 10.0, 'equity', 'NYSE', 'USD', current_date),
    (claude_id, 'CRM', 'Salesforce (Agentforce)', 8.0, 9.0, 'equity', 'NYSE', 'USD', current_date),
    (claude_id, 'NOW', 'ServiceNow (AI agents)', 8.0, 8.0, 'equity', 'NYSE', 'USD', current_date)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Update follower counts to realistic numbers
  update portfolios set followers = 12400 where slug = 'pelosi-tracker';
  update portfolios set followers = 8300 where slug = 'trump-trades';
  update portfolios set followers = 5600 where slug = 'renta4-moderada';
  update portfolios set followers = 3100 where slug = 'renta4-moderada-ampliada';
  update portfolios set followers = 2900 where slug = 'larrainvial-top-picks';
  update portfolios set followers = 1800 where slug = 'btg-insights';
  update portfolios set followers = 9400 where slug = 'ai-world-war';
  update portfolios set followers = 6200 where slug = 'claude-portfolio';
  update portfolios set followers = 1200 where slug = 'inverse-cramer';
  update portfolios set followers = 800 where slug = 'infoProbidad-cl';

end $$;
