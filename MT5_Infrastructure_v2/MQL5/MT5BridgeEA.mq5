//+------------------------------------------------------------------+
//|                                              MT5BridgeEA.mq5     |
//|                                  Copyright 2024, TradingBot Ltd. |
//|                                             https://www.mql5.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, TradingBot Ltd."
#property link      "https://www.mql5.com"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

input int      SocketPort = 5555;      // Socket port for trading commands
input string   CandleFile = "candles_data.json";
input string   PriceFile  = "currentPrice.json";
input string   ReqCandle  = "request_candles.txt";
input string   ReqPrice   = "request_price.txt";

CTrade trade;
int server_socket = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("MT5 Bridge EA Started");
   EventSetTimer(1); // Check files every second
   
   // Initialize Socket (Optional, if you want real-time socket trading)
   server_socket = SocketCreate();
   if(server_socket != INVALID_HANDLE) {
      if(!SocketListen(server_socket, SocketPort)) {
         Print("Socket Listen failed: ", GetLastError());
      } else {
         Print("Socket listening on port ", SocketPort);
      }
   }
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(server_socket != INVALID_HANDLE) SocketClose(server_socket);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Optional: Live price streaming could happen here
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
    HandleCandleRequest();
    HandlePriceRequest();
    HandlePositionsRequest();
    HandleSocketCommands();
}

//+------------------------------------------------------------------+
//| Handle Positions Requests (File Bridge)                          |
//+------------------------------------------------------------------+
void HandlePositionsRequest()
{
   if(!FileIsExist("request_positions.txt")) return;
   
   FileDelete("request_positions.txt");
   
   string json = "[";
   int total = PositionsTotal();
   for(int i=0; i<total; i++) {
      if(PositionSelectByTicket(PositionGetTicket(i))) {
         json += "{";
         json += "\"symbol\":\"" + PositionGetString(POSITION_SYMBOL) + "\",";
         json += "\"ticket\":" + IntegerToString(PositionGetInteger(POSITION_TICKET)) + ",";
         json += "\"type\":" + IntegerToString(PositionGetInteger(POSITION_TYPE)) + ",";
         json += "\"volume\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ",";
         json += "\"priceOpen\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 5) + ",";
         json += "\"priceCurrent\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 5) + ",";
         json += "\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2);
         json += "}";
         if(i < total - 1) json += ",";
      }
   }
   json += "]";
   
   int out = FileOpen("positions_data.json", FILE_WRITE|FILE_ANSI);
   if(out != INVALID_HANDLE) {
      FileWriteString(out, json);
      FileClose(out);
   }
}

//+------------------------------------------------------------------+
//| Handle Candle Requests (File Bridge)                             |
//+------------------------------------------------------------------+
void HandleCandleRequest()
{
   if(!FileIsExist(ReqCandle)) return;
   
   int handle = FileOpen(ReqCandle, FILE_READ|FILE_ANSI|FILE_SHARE_READ);
   if(handle == INVALID_HANDLE) return;
   
   string symbol = "";
   ENUM_TIMEFRAMES timeframe = PERIOD_H1;
   datetime from_date = 0;
   
   while(!FileIsEnding(handle)) {
      string line = FileReadString(handle);
      if(StringFind(line, "SYMBOL=") == 0) symbol = StringSubstr(line, 7);
      if(StringFind(line, "TIMEFRAME=") == 0) timeframe = StringToTimeframe(StringSubstr(line, 10));
      if(StringFind(line, "FROM=") == 0) from_date = StringToTime(StringSubstr(line, 5));
   }
   FileClose(handle);
   FileDelete(ReqCandle);
   
   if(symbol == "") return;
   
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(symbol, timeframe, from_date, TimeCurrent(), rates);
   
   if(copied > 0) {
      string json = "[";
      for(int i=0; i<copied; i++) {
         json += "{\"time\":\"" + TimeToString(rates[i].time, TIME_DATE|TIME_MINUTES) + "\",";
         json += "\"open\":" + DoubleToString(rates[i].open, 5) + ",";
         json += "\"high\":" + DoubleToString(rates[i].high, 5) + ",";
         json += "\"low\":" + DoubleToString(rates[i].low, 5) + ",";
         json += "\"close\":" + DoubleToString(rates[i].close, 5) + "}";
         if(i < copied - 1) json += ",";
      }
      json += "]";
      
      int out = FileOpen(CandleFile, FILE_WRITE|FILE_ANSI);
      if(out != INVALID_HANDLE) {
         FileWriteString(out, json);
         FileClose(out);
      }
   }
}

//+------------------------------------------------------------------+
//| Handle Price Requests (File Bridge)                              |
//+------------------------------------------------------------------+
void HandlePriceRequest()
{
   if(!FileIsExist(ReqPrice)) return;
   
   int handle = FileOpen(ReqPrice, FILE_READ|FILE_ANSI|FILE_SHARE_READ);
   if(handle == INVALID_HANDLE) return;
   
   string symbol = "";
   while(!FileIsEnding(handle)) {
      string line = FileReadString(handle);
      if(StringFind(line, "SYMBOL=") == 0) symbol = StringSubstr(line, 7);
   }
   FileClose(handle);
   FileDelete(ReqPrice);
   
   if(symbol == "") return;
   
   double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
   
   string json = "{\"symbol\":\"" + symbol + "\", \"bid\":" + DoubleToString(bid, 5) + ", \"ask\":" + DoubleToString(ask, 5) + ", \"mid\":" + DoubleToString((bid+ask)/2, 5) + "}";
   
   int out = FileOpen(PriceFile, FILE_WRITE|FILE_ANSI);
   if(out != INVALID_HANDLE) {
      FileWriteString(out, json);
      FileClose(out);
   }
}

//+------------------------------------------------------------------+
//| Handle Socket Trading Commands                                   |
//+------------------------------------------------------------------+
void HandleSocketCommands()
{
   if(server_socket == INVALID_HANDLE) return;
   
   uint client_socket = SocketAccept(server_socket);
   if(client_socket != INVALID_HANDLE) {
      char data[];
      int received = SocketRead(client_socket, data, 1024, 100);
      if(received > 0) {
         string cmd = CharArrayToString(data);
         Print("Received Socket Command: ", cmd);
         // Format: TRADE|SYMBOL|ACTION|PRICE|TP|SL|LOT
         // Example: TRADE|EURUSD|BUY|0|0|0|0.01
         string parts[];
         int count = StringSplit(cmd, '|', parts);
         if(count >= 3 && parts[0] == "TRADE") {
            string sym = parts[1];
            string action = parts[2];
            double lot = (count >= 7) ? StringToDouble(parts[6]) : 0.01;
            
            if(action == "BUY") trade.Buy(lot, sym);
            else if(action == "SELL") trade.Sell(lot, sym);
         }
      }
      SocketClose(client_socket);
   }
}

//+------------------------------------------------------------------+
//| Helper to convert string timeframe to enum                       |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES StringToTimeframe(string tf)
{
   if(tf == "1Min" || tf == "1m") return PERIOD_M1;
   if(tf == "5Min" || tf == "5m") return PERIOD_M5;
   if(tf == "15Min") return PERIOD_M15;
   if(tf == "30Min") return PERIOD_M30;
   if(tf == "1Hour" || tf == "1h") return PERIOD_H1;
   if(tf == "4Hour" || tf == "4h") return PERIOD_H4;
   if(tf == "1Day" || tf == "1d") return PERIOD_D1;
   return PERIOD_H1;
}
