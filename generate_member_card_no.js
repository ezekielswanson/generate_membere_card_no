const hubspot = require('@hubspot/api-client');

exports.main = async (event, callback) => {
  try {
    // Initialize HubSpot client
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.generateMemberNo
    });

    // Get data from input fields instead of API calls
    const contactId = event.inputFields['contact_to_update'];
    const memberId = event.inputFields['member_id'];
    const existingMemberCardNo = event.inputFields['member_no'];
    
    console.log(`Processing contact ${contactId} with member_id: ${memberId}`);
    
    // Skip if member_card_no already exists
    if (existingMemberCardNo && existingMemberCardNo.trim() !== '') {
      console.log(`Contact ${contactId} already has member_card_no: ${existingMemberCardNo}`);
      callback({
        outputFields: {
          status: 'skipped',
          message: 'Member card number already exists',
          member_card_no: existingMemberCardNo
        }
      });
      return;
    }
    
    // Validate member_id exists and has at least 5 digits
    if (!memberId || memberId.toString().length < 5) {
      const errorMsg = `Invalid member_id: ${memberId}. Must be at least 5 digits.`;
      console.error(errorMsg);
      callback({
        outputFields: {
          status: 'error',
          message: errorMsg,
          member_card_no: null
        }
      });
      return;
    }
    
    // Extract last 5 digits from member_id
    const memberIdStr = memberId.toString();
    const last5Digits = memberIdStr.slice(-5);
    
    // Generate unique member_card_no
    let memberCardNo;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate first 2 digits (01-99, no 00)
      const firstTwoDigits = Math.floor(Math.random() * 99) + 1;
      const formattedFirstTwo = firstTwoDigits.toString().padStart(2, '0');
      
      // Create member_card_no: [XX][00000][YYYYY]
      memberCardNo = formattedFirstTwo + '00000' + last5Digits;
      
      // Check uniqueness by searching for existing member_card_no
      try {
        const searchRequest = {
          filterGroups: [{
            filters: [{
              propertyName: 'member_card_no',
              operator: 'EQ',
              value: memberCardNo
            }]
          }],
          properties: ['member_card_no'],
          limit: 1
        };
        
        const searchResults = await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
        
        if (searchResults.results.length === 0) {
          isUnique = true;
        } else {
          attempts++;
          console.log(`Duplicate found for ${memberCardNo}, attempt ${attempts}`);
        }
      } catch (searchError) {
        console.error('Error checking uniqueness:', searchError);
        attempts++;
      }
    }
    
    if (!isUnique) {
      const errorMsg = `Failed to generate unique member_card_no after ${maxAttempts} attempts`;
      console.error(errorMsg);
      callback({
        outputFields: {
          status: 'error',
          message: errorMsg,
          member_card_no: null
        }
      });
      return;
    }
    
    // Update the contact with the new member_card_no
    await hubspotClient.crm.contacts.basicApi.update(contactId, {
      properties: {
        member_card_no: memberCardNo
      }
    });
    
    console.log(`Successfully generated member_card_no: ${memberCardNo} for contact ${contactId}`);
    
    callback({
      outputFields: {
        status: 'success',
        message: `Generated member card number: ${memberCardNo}`,
        member_card_no: memberCardNo,
        member_id_used: memberId,
        last_5_digits: last5Digits,
        attempts_needed: attempts + 1
      }
    });
    
  } catch (error) {
    console.error('Error in member card generation:', error);
    callback({
      outputFields: {
        status: 'error',
        message: `Error: ${error.message}`,
        member_card_no: null
      }
    });
  }
};
