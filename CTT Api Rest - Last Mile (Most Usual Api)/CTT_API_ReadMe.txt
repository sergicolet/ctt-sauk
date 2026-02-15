
                            ▄▄█           ▄▄█      
                         ▄█████        ▄█████      
             ▄▄▄▄▄▄▄     ██████        ██████      
         ▄████████████   ██████████    ██████████  
       ▄███████▀▀▀▀██▌   ██████████    ██████████  
      ▄██████            ██████        ██████      
      ██████             ██████        ██████      
     ▐██████             ██████        ██████      
      ██████             ██████        ██████      
      ▀██████            ██████        ██████      
       ▀█████████████▌   ▐██████▄▄▄    ▐██████▄▄▄  
         ▀████████████    ▀████████     ▀████████  
             ▀▀▀▀▀           ▀▀▀▀          ▀▀▀▀    


  █████  ██████  ██     ██████  ███████ ███████ ████████ 
 ██   ██ ██   ██ ██     ██   ██ ██      ██         ██    
 ███████ ██████  ██     ██████  █████   ███████    ██    
 ██   ██ ██      ██     ██   ██ ██           ██    ██    
 ██   ██ ██      ██     ██   ██ ███████ ███████    ██ 




------------------------------------------------------------------------------------------------------------------------------
-- OVERVIEW
------------------------------------------------------------------------------------------------------------------------------


------------------------------------------------------------------------------------------------------------------------------
-- 0. Token
------------------------------------------------------------------------------------------------------------------------------
The first step is to retrieve your token (Authorization: Bearer {the_generated_token_here}) to be able to access and use any of the API.
The token is valid maximum 24h. After this delay, a new token must be generated.

------------------------------------------------------------------------------------------------------------------------------
-- 1. Shipping manifest
------------------------------------------------------------------------------------------------------------------------------
The shipments can be declared through the following API method.

------------------------------------------------------------------------------------------------------------------------------
-- 2. Shipping labels 
------------------------------------------------------------------------------------------------------------------------------
All details contained in the label on the package can be accessed there.

------------------------------------------------------------------------------------------------------------------------------
-- 3. CTT PUDO Points
------------------------------------------------------------------------------------------------------------------------------
This endpoint will be used to get the list of all available Ctt Points.
The list will be returned in different pages with a maximum of 1000 points for each page. 
The endpoint should be used as many times as needed until all pages are returned.

------------------------------------------------------------------------------------------------------------------------------
-- 4. Cancel Shipping
------------------------------------------------------------------------------------------------------------------------------
This endpoint allows the shipment to be cancelled.

------------------------------------------------------------------------------------------------------------------------------
-- 5. Containerisation
------------------------------------------------------------------------------------------------------------------------------
This endpoint allows the registration of containers in batches with their respective packages or a single container with all its packages.
You can register:
- multiple containers
- individual container

------------------------------------------------------------------------------------------------------------------------------
-- 6. Shipping Tracking
------------------------------------------------------------------------------------------------------------------------------
-> 1: Per tracking number: This endpoint will be used to get the shipping status information.
-> 2: Per dates: This endpoint will be used to get the shipping status information of many trackings by passing a date or a date range in the request. 
	  Other parameters are also available in this URL such as the event code

------------------------------------------------------------------------------------------------------------------------------
-- 7. Proof of delivery - POD
------------------------------------------------------------------------------------------------------------------------------
This API allows you to retrieve the Proof of delivery of one shipment in PDF format.

------------------------------------------------------------------------------------------------------------------------------
-- 8. Get Working Days
------------------------------------------------------------------------------------------------------------------------------
This endpoint is used to know the next 7 days in which a collection can be made.
For this, the system takes into account the current time of the request, the day and the origin zip code.

------------------------------------------------------------------------------------------------------------------------------
-- 9. Shipping Management
------------------------------------------------------------------------------------------------------------------------------
This API allows you to modify delivery details, manage shipments, handle returns, allowing therefore flexible management of shipping and delivery processes.




------------------------------------------------------------------------------------------------------------------------------
-- URLs
------------------------------------------------------------------------------------------------------------------------------


------------------------------------------------------------------------------------------------------------------------------
-- 0. Token
------------------------------------------------------------------------------------------------------------------------------
TEST: POST https://api-test.cttexpress.com/integrations/oauth2/token
PROD: POST https://api.cttexpress.com/integrations/oauth2/token

------------------------------------------------------------------------------------------------------------------------------
BASE URLs: for Test and for Production
------------------------------------------------------------------------------------------------------------------------------
TEST: https://api-test.cttexpress.com
PROD: https://api.cttexpress.com

------------------------------------------------------------------------------------------------------------------------------
-- 1. Shipping manifest
------------------------------------------------------------------------------------------------------------------------------
POST {{baseUrl}}/integrations/manifest/v2.0/shippings

------------------------------------------------------------------------------------------------------------------------------
-- 2. Shipping labels 
------------------------------------------------------------------------------------------------------------------------------
GET {{baseUrl}}/integrations/trf/labelling/v1.0/shippings/{{trackingNum_22digits}}/shipping-labels?label_type_code=PDF&model_type_code=MULTI4&label_offset=1
GET {{baseUrl}}/integrations/trf/labelling/v1.0/shippings/{{trackingNum_22digits}}/shipping-labels?label_type_code=PDF2&model_type_code=MULTI4&label_offset=1
GET {{baseUrl}}/integrations/trf/labelling/v1.0/shippings/{{trackingNum_22digits}}/shipping-labels?label_type_code=PDF&model_type_code=SINGLE&label_offset=1

------------------------------------------------------------------------------------------------------------------------------
-- 3. CTT PUDO Points
------------------------------------------------------------------------------------------------------------------------------
POST {{baseUrl}}/integrations/delivery/v1.0/distribution-points/search?page_limit=1000&page_offsets={{pageNumber}}
page_limit: max 1000
page_offsets: begins at 0, search "last" parameter to get last page num in block "pagination" in the response

------------------------------------------------------------------------------------------------------------------------------
-- 4. Cancel Shipping
------------------------------------------------------------------------------------------------------------------------------
POST {{baseUrl}}/integrations/manifest/v1.0/rpc-cancel-shipping-by-shipping-code/{{trackingNum_22digits}}

------------------------------------------------------------------------------------------------------------------------------
-- 5. Containerisation
------------------------------------------------------------------------------------------------------------------------------
POST {{baseUrl}}/integrations/trf/client-containers

------------------------------------------------------------------------------------------------------------------------------
-- 6. Shipping Tracking 
------------------------------------------------------------------------------------------------------------------------------
[Set up around 30 calls/sec to allow good performance on this server]


-> 1: Per tracking number: 
	GET {{baseUrl}}/integrations-info/trf/item-history-api/history/{{trackingNum_22digits}}?view=APITRACK&showItems=false
-> 2: Per dates: 
	GET {{baseUrl}}/integrations/trf/web-tracking/v1.0/shippings?page_limit=100&page_offsets={{pageNumber}}&mapping_table_code=APITRACK&order_by=-shipping_date&client_center_code={{clientcodecenter_10digits}}&shipping_date=YYYY-MM-DD
page_limit: max 110
page_offsets: begins at 1, search "last" parameter to get last page num in block "pagination" in the response

------------------------------------------------------------------------------------------------------------------------------
-- 7. Proof of delivery - POD
------------------------------------------------------------------------------------------------------------------------------
GET {{baseUrl}}/integrations/cls/pods/{trackingNum_22digits}?client_center_code={code}&hash={md5calculation_on_22digitsshippingnum+10digitsclientcentercode+finalzipcodeofshipment}

------------------------------------------------------------------------------------------------------------------------------
-- 8. Get Working Days
------------------------------------------------------------------------------------------------------------------------------
GET {{baseUrl}}/integrations/css/v1.0/rpc-get-working-days?from_date=2024-09-01&working_days=0&working_dates_count=7&postal_code=28050,49026

------------------------------------------------------------------------------------------------------------------------------
-- 9. Shipping Management (*) This API has different final endpoints, depeding on the change to introduce
------------------------------------------------------------------------------------------------------------------------------
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-change-delivery-address
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-change-delivery-options
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-change-delivery-options
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-cancel
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-stop-on-the-fly
POST {{baseUrl}}/integrations/trf/v1.0/management/v1/shippings/{client_center_code}/{shipping_code}/rpc-create-reverse-shipping


