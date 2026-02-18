import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../authentication/authentication-backend';

// Security validation function for avatar uploads
function validateAvatarDataUrl(dataUrl: string): { isValid: boolean; reason?: string } {
  try {
    // Check if it's a valid data URL
    if (!dataUrl.startsWith('data:')) {
      return { isValid: false, reason: 'Invalid data URL format' };
    }

    // Parse the data URL
    const [header, base64Data] = dataUrl.split(',');
    if (!header || !base64Data) {
      return { isValid: false, reason: 'Malformed data URL' };
    }

    // Extract MIME type
    const mimeMatch = header.match(/data:([^;]+)/);
    if (!mimeMatch) {
      return { isValid: false, reason: 'Invalid MIME type' };
    }

    const mimeType = mimeMatch[1].toLowerCase();

    // Allow only safe image MIME types
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      return { isValid: false, reason: `File type '${mimeType}' is not allowed. Only image files are permitted.` };
    }

    // Check file size (base64 is ~33% larger than binary)
    const binarySize = (base64Data.length * 3) / 4;
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB limit

    if (binarySize > maxSizeBytes) {
      return { isValid: false, reason: 'File size exceeds 5MB limit' };
    }

    // Validate file format by checking magic bytes (file signatures)
    const decodedBuffer = Buffer.from(base64Data, 'base64');
    
    // Universal security check: Check for suspicious patterns in ALL files
    // This prevents malicious content regardless of MIME type declaration
    // This restores the security check that was present in the previous implementation
    try {
      const fileContent = decodedBuffer.toString('utf-8');
      const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onload=/i,
        /onerror=/i,
        /eval\(/i,
        /document\./i,
        /window\./i,
        /<iframe/i,
        /<embed/i,
        /<object/i,
        /data:text\/html/i,
        /base64.*data:text\/html/i
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(fileContent)) {
          return { isValid: false, reason: 'File contains potentially malicious content' };
        }
      }
    } catch (err) {
      // If file is binary and can't be decoded as UTF-8, that's acceptable
      // We'll continue with magic byte validation below
    }
    
    // Check file magic bytes to ensure it's actually an image
    const imageMagicBytes: { [key: string]: Buffer[] } = {
      'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])], // JPEG: FF D8 FF
      'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], // PNG: 89 50 4E 47 0D 0A 1A 0A
      'image/gif': [Buffer.from('GIF87a', 'ascii'), Buffer.from('GIF89a', 'ascii')], // GIF: GIF87a or GIF89a
      'image/webp': [Buffer.from('RIFF', 'ascii')], // WebP: RIFF (check further for WEBP)
      'image/svg+xml': [Buffer.from('<svg', 'utf-8'), Buffer.from('<?xml', 'utf-8')] // SVG: starts with <svg or <?xml
    };

    const magicBytes = imageMagicBytes[mimeType];
    if (magicBytes) {
      let isValidFormat = false;
      for (const magic of magicBytes) {
        if (decodedBuffer.slice(0, magic.length).equals(magic)) {
          isValidFormat = true;
          break;
        }
      }
      
      // For WebP, also check that it contains WEBP after RIFF
      if (mimeType === 'image/webp' && isValidFormat) {
        const webpCheck = decodedBuffer.slice(8, 12).toString('ascii');
        if (webpCheck !== 'WEBP') {
          isValidFormat = false;
        }
      }
      
      // For SVG, check if it's valid XML/SVG content
      if (mimeType === 'image/svg+xml' && isValidFormat) {
        const svgContent = decodedBuffer.toString('utf-8');
        // Check for suspicious patterns in SVG (XSS prevention)
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /vbscript:/i,
          /onload=/i,
          /onerror=/i,
          /eval\(/i,
          /document\./i,
          /window\./i
        ];
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(svgContent)) {
            return { isValid: false, reason: 'SVG contains potentially malicious content' };
          }
        }
      }
      
      if (!isValidFormat) {
        return { isValid: false, reason: `File does not match declared MIME type '${mimeType}'. File may be corrupted or mislabeled.` };
      }
    }

    // Check for executable/archive signatures only at the beginning (magic bytes)
    // This prevents false positives from binary image data
    const executableSignatures = [
      Buffer.from('MZ'), // PE executable
      Buffer.from('ELF'), // Linux executable
      Buffer.from('#!/'), // Shell script
      Buffer.from('PK\x03\x04'), // ZIP file
      Buffer.from([0x50, 0x4B, 0x03, 0x04]) // ZIP file (hex)
    ];

    for (const signature of executableSignatures) {
      if (decodedBuffer.slice(0, signature.length).equals(signature)) {
        return { isValid: false, reason: 'File appears to be an executable or archive' };
      }
    }

    return { isValid: true };
  } catch (error) {
    console.error('Avatar validation error:', error);
    return { isValid: false, reason: 'File validation failed' };
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticationBackend.getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { avatarDataUrl } = await req.json();
  if (!avatarDataUrl || typeof avatarDataUrl !== 'string') {
    return NextResponse.json({ error: 'Invalid avatar data' }, { status: 400 });
  }

  // Security validation for file upload
  const validationResult = validateAvatarDataUrl(avatarDataUrl);
  if (!validationResult.isValid) {
    console.warn(`Avatar API: Blocked malicious upload attempt from user ${user.email}: ${validationResult.reason}`);
    return NextResponse.json({ error: validationResult.reason }, { status: 400 });
  }  
  
  const result = await getDb().collection('users').updateOne(
    { _id: user._id },
    { $set: { avatarDataUrl } }
  );  
  
  if (result.matchedCount === 0) {
    console.error('Avatar API: No user found with ID:', user._id);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  
  if (result.modifiedCount === 0) {
    console.warn('Avatar API: Avatar was not modified (might be the same data)');
  }
  
  return NextResponse.json({ success: true });
} 